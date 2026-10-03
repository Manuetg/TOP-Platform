[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [Parameter(Mandatory = $true)][string]$Destination,
    [switch]$MaintenanceApproved
)
. (Join-Path $PSScriptRoot 'Common.ps1')

if (-not $MaintenanceApproved) { throw 'Confirmar una ventana sin nuevas escrituras antes de respaldar base y objetos como conjunto.' }
Initialize-Pilot -EnvPath $EnvPath
$destinationRoot = Resolve-PilotProtectedPath $Destination $script:PilotRoot -Directory
if ($destinationRoot.Contains(',')) { throw 'La ruta del respaldo no puede contener coma, por el formato de mount Docker.' }
$state = Assert-PilotRuntime -RequireData
if (-not $state.postgres.state.Running) { throw 'PostgreSQL propio debe estar operativo para pg_dump; no arrancar una instancia ajena.' }
$runId = [Guid]::NewGuid().ToString('N')
$backupDirectory = Join-Path $destinationRoot ('backup-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $runId)
[void](New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop)
Assert-PilotRestrictedAcl $backupDirectory
$dumpInContainer = '/tmp/top-pilot-backup-' + $runId + '.dump'
$completed = $false
try {
    [void](Invoke-PilotCompose -Arguments @('stop', '--timeout', '30', 'gateway', 'api') -Action 'quiesce de escrituras propias')
    [void](Invoke-PilotCompose -Arguments @('stop', '--timeout', '30', 'minio') -Action 'quiesce de objetos propios')
    $state = Assert-PilotRuntime -RequireData
    if (@($state.Values | Where-Object { $_.service.'com.docker.compose.service' -in @('gateway', 'api', 'minio') -and $_.state.Running }).Count -gt 0) { throw 'No se detuvieron todas las escrituras del piloto.' }
    Assert-PilotDatabase $state.postgres.id -NoClients
    Write-PilotPrivateFile (Join-Path $backupDirectory 'postgres-counts.tsv') ((Get-PilotTableCounts $state.postgres.id) + "`n")
    [void](Invoke-PilotDocker -Arguments @('exec', $state.postgres.id, 'pg_dump', '--no-password', '-U', 'top_pilot', '-d', 'top_pilot', '--format', 'custom', '--file', $dumpInContainer) -Action 'dump PostgreSQL propio directo a archivo')
    [void](Invoke-PilotDocker -Arguments @('cp', ($state.postgres.id + ':' + $dumpInContainer), (Join-Path $backupDirectory 'postgres.dump')) -Action 'copia privada de dump')
    Invoke-PilotHelper -VolumeName ($script:PilotProject + '_minio_data') -BackupDirectory $backupDirectory -ReadObjectsBackup -Command 'set -eu; cd /data; tar -cf /backup/minio.tar .; find . -type f > /backup/minio-paths.tmp; : > /backup/minio-unsorted.tmp; while IFS= read -r file; do sha256sum "$file" >> /backup/minio-unsorted.tmp; done < /backup/minio-paths.tmp; LC_ALL=C sort /backup/minio-unsorted.tmp > /backup/minio-files.sha256; expected=$(wc -l < /backup/minio-paths.tmp); actual=$(wc -l < /backup/minio-files.sha256); test "$expected" -eq "$actual"; rm -f -- /backup/minio-paths.tmp /backup/minio-unsorted.tmp'
    $records = @('postgres.dump', 'minio.tar', 'postgres-counts.tsv', 'minio-files.sha256' | ForEach-Object { Get-PilotFileRecord $backupDirectory $_ })
    $manifest = [ordered]@{
        schemaVersion = 1
        type = 'top-pilot-coherent-backup'
        complete = $true
        runId = $runId
        createdAtUtc = [DateTime]::UtcNow.ToString('o')
        sourceProject = $script:PilotProject
        sourceCommit = $script:PilotEnv.PILOT_SOURCE_COMMIT
        postgresDatabase = 'top_pilot'
        s3Bucket = $script:PilotEnv.S3_BUCKET
        imageIds = $script:PilotImageIds
        files = $records
        quiesced = @('gateway', 'api', 'minio')
        note = 'Datos sensibles. Conservar el conjunto completo y las credenciales por separado; copia raw MinIO requiere imagen compatible exacta.'
    }
    Write-PilotPrivateFile (Join-Path $backupDirectory 'manifest.json') ($manifest | ConvertTo-Json -Depth 8)
    Write-PilotPrivateFile (Join-Path $backupDirectory 'manifest.sha256') ((Get-FileHash -LiteralPath (Join-Path $backupDirectory 'manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant())
    $completed = $true
    [pscustomobject]@{ status = 'BACKUP_COMPLETE_HASHED_APPLICATION_STOPPED'; project = $script:PilotProject; directory = $backupDirectory; servicesResumed = $false; note = 'Gateway/API/MinIO permanecen detenidos. Reabrir con Start.ps1 tras revisar resultado. No equivale a restore probado; guardar copia protegida fuera del disco activo según responsable/RPO/RTO acordados.' }
} catch {
    throw ('Backup o reanudación falló. Conjunto ' + $(if ($completed) { 'completo; revisar reanudación' } else { 'incompleto; no restaurar' }) + '. Se conservaron archivos en ' + $backupDirectory + '. No se reanudan servicios tras un fallo; revisar estado de gateway/API/MinIO propios. PostgreSQL y volúmenes se preservan.')
} finally {
    # Único borrado: archivo temporal exacto creado por esta ejecución en PG propio.
    [void](Invoke-PilotDocker -Arguments @('exec', $state.postgres.id, 'rm', '-f', '--', $dumpInContainer) -Action 'retiro del dump temporal propio' -AllowFailure)
}
