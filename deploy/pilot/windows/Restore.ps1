[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [Parameter(Mandatory = $true)][string]$Project,
    [switch]$RestoreApproved,
    [ValidateRange(10, 300)][int]$ReadyTimeoutSeconds = 120
)
. (Join-Path $PSScriptRoot 'Common.ps1')

if (-not $RestoreApproved) { throw 'Restaurar ejecuta contenido del dump; usar sólo un backup propio confiable y un proyecto nuevo aprobado.' }
Initialize-Pilot -EnvPath $EnvPath -Restore -Project $Project
$backupRoot = Resolve-PilotProtectedPath $BackupDirectory $script:PilotRoot -Directory
if ($backupRoot.Contains(',')) { throw 'La ruta del respaldo no puede contener coma, por el formato de mount Docker.' }
foreach ($name in @('manifest.json', 'manifest.sha256', 'postgres.dump', 'minio.tar', 'postgres-counts.tsv', 'minio-files.sha256')) {
    $file = Join-Path $backupRoot $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'El conjunto de respaldo está incompleto.' }
    Assert-PilotNoReparse $file
    Assert-PilotRestrictedAcl $file
}
$manifestPath = Join-Path $backupRoot 'manifest.json'
$hash = [IO.File]::ReadAllText((Join-Path $backupRoot 'manifest.sha256')).Trim()
if ($hash -cnotmatch '^[0-9a-f]{64}$' -or (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ine $hash) { throw 'Falló la integridad del manifiesto de backup.' }
try { $backup = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json } catch { throw 'Manifiesto de backup inválido.' }
if ($backup.schemaVersion -ne 1 -or $backup.type -cne 'top-pilot-coherent-backup' -or $backup.complete -ne $true -or $backup.sourceProject -cne $script:PilotEnv.PILOT_PROJECT -or $backup.sourceCommit -cne $script:PilotEnv.PILOT_SOURCE_COMMIT -or $backup.postgresDatabase -cne 'top_pilot' -or $backup.s3Bucket -cne $script:PilotEnv.S3_BUCKET) { throw 'Backup no completo o no corresponde al origen aprobado.' }
foreach ($key in $script:PilotImageKeys) { if ($backup.imageIds.$key -cne $script:PilotImageIds[$key]) { throw 'Restore exige las mismas identidades de imágenes probadas, incluida compatibilidad raw MinIO.' } }
$expectedNames = @('minio-files.sha256', 'minio.tar', 'postgres-counts.tsv', 'postgres.dump')
if (@(Compare-Object $expectedNames (@($backup.files.name) | Sort-Object)).Count -ne 0) { throw 'Inventario de archivos del backup inesperado.' }
foreach ($record in $backup.files) {
    $actual = Get-PilotFileRecord $backupRoot $record.name
    if ($actual.sha256 -cne $record.sha256 -or $actual.bytes -ne $record.bytes) { throw 'Un archivo del conjunto de respaldo no coincide con su hash o tamaño.' }
}
# Preflight antes de crear el clon: conservar UID/GID/modos del archivo, rechazar
# formatos/rutas/tipos incompatibles y evitar reparación del volumen original.
$metadata = @(Get-PilotArchiveMetadata (Join-Path $backupRoot 'minio.tar'))
$imageUser = (Invoke-PilotDocker -Arguments @('image', 'inspect', $script:PilotEnv.MINIO_IMAGE, '--format', '{{json .Config.User}}') -Action 'identidad UID/GID de la imagen MinIO').Output | ConvertFrom-Json
Assert-PilotArchiveImageCompatibility $metadata ([string]$imageUser)
$ownershipInventory = ConvertTo-PilotOwnershipInventory $metadata
$requiresChown = @($metadata | Where-Object { $_.Uid -ne 0 -or $_.Gid -ne 0 }).Count -gt 0
if (@(Get-PilotContainers).Count -ne 0) { throw 'El proyecto de restore ya tiene contenedores; elegir un nombre nuevo, no sobrescribir.' }
foreach ($kind in @('postgres_data', 'minio_data')) {
    if ((Invoke-PilotDocker -Arguments @('volume', 'inspect', ($script:PilotProject + '_' + $kind)) -Action 'comprobación de destino nuevo' -AllowFailure).ExitCode -eq 0) { throw 'El proyecto de restore ya tiene volúmenes; elegir otro proyecto nuevo.' }
}
if ((Invoke-PilotDocker -Arguments @('network', 'inspect', ($script:PilotProject + '_isolated')) -Action 'comprobación de red nueva' -AllowFailure).ExitCode -eq 0) { throw 'El proyecto de restore ya tiene red; elegir otro proyecto nuevo.' }
$started = [DateTime]::UtcNow
$dumpInContainer = '/tmp/top-pilot-restore-' + [Guid]::NewGuid().ToString('N') + '.dump'
$state = $null
try {
    [void](Invoke-PilotCompose -Arguments @('up', '--detach', '--no-build', '--no-recreate', '--pull', 'never', 'postgres') -Action 'creación de PostgreSQL de restore aislado')
    # Crear MinIO sin arrancarlo: el volumen debe estar vacío antes de extraer.
    [void](Invoke-PilotCompose -Arguments @('create', '--no-build', '--pull', 'never', 'minio') -Action 'creación detenida del volumen MinIO de restore')
    Wait-PilotDataForRestore $ReadyTimeoutSeconds
    $state = Assert-PilotRuntime -Restore -RequireData
    Assert-PilotDatabase $state.postgres.id -NoClients -Empty
    if ($state.minio.state.Running) { throw 'MinIO de restore debe permanecer detenido durante extracción.' }
    Invoke-PilotHelper -VolumeName ($script:PilotProject + '_minio_data') -BackupDirectory $backupRoot -WriteVolume -ReadBackup -InputText $ownershipInventory -RestoreOwnership:$requiresChown -Command (Get-PilotRestoreObjectsCommand)
    [void](Invoke-PilotDocker -Arguments @('cp', (Join-Path $backupRoot 'postgres.dump'), ($state.postgres.id + ':' + $dumpInContainer)) -Action 'copia privada de dump a destino nuevo')
    [void](Invoke-PilotDocker -Arguments @('exec', $state.postgres.id, 'pg_restore', '--no-password', '-U', 'top_pilot', '-d', 'top_pilot', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', $dumpInContainer) -Action 'pg_restore en base nueva sin clean')
    # Reponer ACL de la copia técnica exclusivamente. No password ni LOGIN/API.
    Invoke-PilotApplicationRoleProvision $state.postgres.id
    $expectedCounts = [IO.File]::ReadAllText((Join-Path $backupRoot 'postgres-counts.tsv')).Trim()
    if ((Get-PilotTableCounts $state.postgres.id) -cne $expectedCounts) { throw 'Los conteos de tablas restauradas no coinciden; mantener clon aislado para revisión.' }
    [void](Invoke-PilotDocker -Arguments @('start', $state.minio.id) -Action 'arranque MinIO exclusivo del clon para readiness')
    $limit = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    $storageReady = $false
    do {
        $state = Assert-PilotRuntime -Restore -RequireData
        if (-not $state.minio.state.Running) { throw 'MinIO del clon se detuvo durante readiness.' }
        if ($state.minio.state.Health.Status -eq 'healthy') { $storageReady = $true; break }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $limit)
    if (-not $storageReady) { throw 'MinIO restaurado no alcanzó health healthy dentro del límite.' }
    $result = [pscustomobject]@{
        status = 'RESTORED_HASHES_AND_TABLE_COUNTS_MATCH'
        project = $script:PilotProject
        elapsedSeconds = [Math]::Round(([DateTime]::UtcNow - $started).TotalSeconds, 2)
        note = 'Clon sin API/correo/puertos host, detenido al finalizar. Hashes y UID/GID/modos del tar, conteos y health storage verificados; no acredita login, reglas de dominio ni tiempo de recuperación del host Ema.'
    }
} catch {
    throw 'Restore no completado. Se conservaron base, objetos y volúmenes nuevos para revisión; se solicitó su parada. El piloto de origen no se modificó y el backup se mantiene intacto.'
} finally {
    if ($state -and $state.postgres) { [void](Invoke-PilotDocker -Arguments @('exec', $state.postgres.id, 'rm', '-f', '--', $dumpInContainer) -Action 'retiro del dump temporal del clon' -AllowFailure) }
    $stop = Invoke-PilotCompose -Arguments @('stop', '--timeout', '30') -Action 'parada exclusiva del clon de restore, preservando volúmenes' -AllowFailure
    if ($stop.ExitCode -ne 0) { throw 'No se confirmó la parada del clon de restore. Datos preservados; revisar el proyecto nuevo antes de declarar éxito.' }
    $finalState = Assert-PilotRuntime -Restore
    if (@($finalState.Values | Where-Object { $_.state.Running }).Count -ne 0) { throw 'El clon de restore conserva servicios activos; no declarar parada completada. Datos preservados.' }
}
$result
