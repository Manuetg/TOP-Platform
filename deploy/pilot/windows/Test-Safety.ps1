[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'Common.ps1')

# Pruebas de lógica/configuración cliente. No crea env, credenciales, contenedores,
# volúmenes, redes ni datos; no necesita un daemon Docker operativo.
$script:PilotTestCount = 0
function Assert-PilotTest([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw ('Prueba fallida: ' + $Name) }
    $script:PilotTestCount++
}
function Assert-PilotReject([scriptblock]$Action, [string]$Name) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Assert-PilotTest $rejected $Name
}

function Test-PilotRestoreMetadata {
    # Fixtures tar independientes producidos por .NET (PowerShell 7), sólo en
    # memoria. Los spies del helper observan argv/stdin; nunca llaman Docker.
    $counter = [pscustomobject]@{ Value = 0 }
    function Assert-Metadata([bool]$Condition, [string]$Name) {
        if (-not $Condition) { throw ('Metadata: ' + $Name) }
        $counter.Value++
    }
    function Assert-MetadataReject([scriptblock]$Action, [string]$Name) {
        $rejected = $false
        try { & $Action | Out-Null } catch { $rejected = $true }
        Assert-Metadata $rejected $Name
    }
    function New-MetadataFixture([object[]]$Records, [string]$Format = 'Ustar') {
        $stream = [IO.MemoryStream]::new()
        $writer = [System.Formats.Tar.TarWriter]::new($stream, [System.Formats.Tar.TarEntryFormat]::$Format, $true)
        try {
            foreach ($record in $Records) {
                $type = [System.Formats.Tar.TarEntryType]::$($record.Type)
                if ($Format -eq 'Gnu') { $entry = [System.Formats.Tar.GnuTarEntry]::new($type, $record.Path) }
                elseif ($Format -eq 'Pax') { $entry = [System.Formats.Tar.PaxTarEntry]::new($type, $record.Path) }
                else { $entry = [System.Formats.Tar.UstarTarEntry]::new($type, $record.Path) }
                $entry.Uid = $record.Uid; $entry.Gid = $record.Gid; $entry.Mode = [IO.UnixFileMode]$record.Mode
                if ($type -eq [System.Formats.Tar.TarEntryType]::RegularFile) { $entry.DataStream = [IO.MemoryStream]::new([Text.Encoding]::ASCII.GetBytes('public-disposable-fixture')) }
                if ($type -in @([System.Formats.Tar.TarEntryType]::SymbolicLink, [System.Formats.Tar.TarEntryType]::HardLink)) { $entry.LinkName = '../outside' }
                try { $writer.WriteEntry($entry) } finally { if ($entry.DataStream) { $entry.DataStream.Dispose() } }
            }
        } finally { $writer.Dispose() }
        $stream.Position = 0
        return ,$stream
    }
    function New-MetadataRecord([string]$Path, [string]$Type = 'RegularFile', [int]$Uid = 1000, [int]$Gid = 1000, [int]$Mode = 384) {
        return [pscustomobject]@{ Path = $Path; Type = $Type; Uid = $Uid; Gid = $Gid; Mode = $Mode }
    }
    function Read-MetadataFixture([object[]]$Records, [string]$Format = 'Ustar') {
        $stream = New-MetadataFixture $Records $Format
        try { return @(Read-PilotArchiveMetadata $stream) } finally { $stream.Dispose() }
    }
    function Assert-ArchiveReject([object[]]$Records, [string]$Name, [string]$Format = 'Ustar') {
        # Construir fuera del catch: un rechazo del productor no acredita el parser.
        $stream = New-MetadataFixture $Records $Format
        try { Assert-MetadataReject { Read-PilotArchiveMetadata $stream } $Name } finally { $stream.Dispose() }
    }
    $root = New-MetadataRecord '.' Directory 1000 1000 448
    $dir = New-MetadataRecord './private' Directory 1000 1000 448
    $file = New-MetadataRecord './private/object' RegularFile 1000 1000 384
    $metadata = @(Read-MetadataFixture @($root, $dir, $file))
    Assert-Metadata ($metadata.Count -eq 3 -and $metadata[2].Uid -eq 1000 -and $metadata[2].Gid -eq 1000 -and $metadata[2].Mode -ceq '600' -and $metadata[1].Mode -ceq '700') 'UID/GID y 0600/0700 leídos del tar independiente'
    Assert-PilotArchiveImageCompatibility $metadata '1000:1000'
    Assert-Metadata $true 'imagen numérica compatible'
    Assert-PilotArchiveImageCompatibility $metadata ''
    Assert-Metadata $true 'imagen default root conserva propietarios mixtos'
    foreach ($user in @('1001:1000', '1000:1001', 'minio', 'root', '01000:1000', '4294967295:1000')) {
        Assert-MetadataReject { Assert-PilotArchiveImageCompatibility $metadata $user } ('imagen incompatible ' + $user)
    }
    foreach ($mode in @(256, 320)) {
        $bad = @(Read-MetadataFixture @($root, (New-MetadataRecord './file' RegularFile 1000 1000 $mode)))
        Assert-MetadataReject { Assert-PilotArchiveImageCompatibility $bad '1000:1000' } 'archivo no escribible rechaza imagen no root'
    }
    $badDir = @(Read-MetadataFixture @((New-MetadataRecord '.' Directory 1000 1000 384)))
    Assert-MetadataReject { Assert-PilotArchiveImageCompatibility $badDir '1000:1000' } 'directorio sin traversal rechazado'
    $inventory = (ConvertTo-PilotOwnershipInventory $metadata).TrimEnd("`n") -split "`n"
    Assert-Metadata ($inventory.Count -eq 3 -and $inventory[0] -ceq "1000`t1000`t600`tfile`t./private/object" -and $inventory[1].EndsWith("`t./private") -and $inventory[2].EndsWith("`t.")) 'inventario exacto hojas antes de padres restringidos'
    $longName = './' + ('a' * 210)
    $long = @(Read-MetadataFixture @($root, (New-MetadataRecord $longName)) Gnu)
    Assert-Metadata ($long[1].Path -ceq $longName -and $long[1].Mode -ceq '600') 'GNU LongName de 210 bytes soportado'
    $prefix = './' + ('p' * 90)
    $ustarLong = @(Read-MetadataFixture @($root, (New-MetadataRecord $prefix Directory 1000 1000 448), (New-MetadataRecord ($prefix + '/' + ('b' * 90)))))
    Assert-Metadata ($ustarLong[2].Path.Length -gt 180) 'ustar prefix largo soportado'
    $case = @(Read-MetadataFixture @($root, (New-MetadataRecord './Object'), (New-MetadataRecord './object')))
    Assert-Metadata ($case.Count -eq 3) 'rutas Linux sensibles a mayúsculas'
    foreach ($path in @('../outside', '/absolute', './a/../outside', './a//outside', './a\outside', './with space', "./line`nfeed")) {
        Assert-ArchiveReject @($root, (New-MetadataRecord $path)) ('ruta insegura ' + $path)
    }
    foreach ($type in @('SymbolicLink', 'HardLink', 'Fifo')) {
        Assert-ArchiveReject @($root, (New-MetadataRecord './unsafe' $type)) ('tipo inseguro ' + $type)
    }
    Assert-ArchiveReject @($root, $file) 'directorio padre omitido'
    Assert-ArchiveReject @($file) 'metadata raíz omitida'
    Assert-ArchiveReject @($root, (New-MetadataRecord './same'), (New-MetadataRecord 'same')) 'rutas duplicadas normalizadas'
    Assert-ArchiveReject @($root, (New-MetadataRecord './mode' RegularFile 1000 1000 2541)) 'setuid rechazado'
    Assert-ArchiveReject @($root, $dir, $file) 'PAX no soportado rechazado' Pax
    $stream = New-MetadataFixture @($root, $dir, $file)
    try {
        $bytes = $stream.ToArray(); $bytes[0] = $bytes[0] -bxor 1
        $broken = [IO.MemoryStream]::new($bytes)
        try { Assert-MetadataReject { Read-PilotArchiveMetadata $broken } 'checksum header corrupto' } finally { $broken.Dispose() }
    } finally { $stream.Dispose() }
    $stream = New-MetadataFixture @($root, (New-MetadataRecord $longName)) Gnu
    try {
        # Quitar el archivo siguiente deja un LongName válido pero huérfano.
        $bytes = $stream.ToArray(); $orphan = [IO.MemoryStream]::new()
        $orphan.Write($bytes, 0, 1536); $orphan.Write((New-Object byte[] 1024), 0, 1024); $orphan.Position = 0
        try { Assert-MetadataReject { Read-PilotArchiveMetadata $orphan } 'GNU LongName huérfano' } finally { $orphan.Dispose() }
    } finally { $stream.Dispose() }
    Assert-ArchiveReject @($root, (New-MetadataRecord ('./' + ('x' * 4093)))) 'GNU LongName excede límite BusyBox' Gnu
    $stream = New-MetadataFixture @($root) Gnu
    try {
        $bytes = $stream.ToArray(); $bytes[345] = 97
        # Recalcular checksum para aislar prefix GNU que BusyBox interpretaría.
        for ($i = 148; $i -lt 156; $i++) { $bytes[$i] = 32 }
        $sum = 0; for ($i = 0; $i -lt 512; $i++) { $sum += $bytes[$i] }
        $checksum = [Text.Encoding]::ASCII.GetBytes(([Convert]::ToString($sum, 8).PadLeft(6, '0') + [char]0 + ' '))
        [Array]::Copy($checksum, 0, $bytes, 148, 8)
        $ambiguous = [IO.MemoryStream]::new($bytes)
        try { Assert-MetadataReject { Read-PilotArchiveMetadata $ambiguous } 'metadata GNU extra ambiguo con checksum válido' } finally { $ambiguous.Dispose() }
    } finally { $stream.Dispose() }

    $script:PilotProject = 'top-pilot-restore-metadata-unit'
    $script:PilotScope = 'restore'
    $script:PilotEnv = @{ HELPER_IMAGE = 'sha256:' + ('9' * 64) }
    $spy = [pscustomobject]@{ Calls = 0; Arguments = @(); InputText = ''; Running = $false }
    function Assert-PilotRuntime { param([switch]$Restore, [switch]$RequireData); return @{ minio = @{ state = @{ Running = $spy.Running } } } }
    function Invoke-PilotDocker {
        param([string[]]$Arguments, [string]$Action, [switch]$AllowFailure, [string]$InputText)
        $spy.Calls++; $spy.Arguments = $Arguments; $spy.InputText = $InputText
        return [pscustomobject]@{ ExitCode = 0; Output = '' }
    }
    $volume = $script:PilotProject + '_minio_data'
    Invoke-PilotHelper $volume 'C:\protected\backup' (Get-PilotRestoreObjectsCommand) -WriteVolume -ReadBackup -InputText (ConvertTo-PilotOwnershipInventory $metadata) -RestoreOwnership
    Assert-Metadata ($spy.Calls -eq 1 -and $spy.Arguments -contains 'CHOWN' -and $spy.Arguments -contains 'ALL' -and $spy.Arguments -contains 'no-new-privileges' -and $spy.Arguments -contains 'none' -and $spy.Arguments -contains '--read-only') 'helper CHOWN acotado sin red, rootfs read-only'
    Assert-Metadata ($spy.Arguments -notcontains 'DAC_OVERRIDE' -and $spy.Arguments -notcontains 'FOWNER' -and $spy.Arguments -notcontains '--privileged' -and $spy.InputText -ceq (ConvertTo-PilotOwnershipInventory $metadata)) 'inventario por stdin sin privilegios extra'
    Assert-Metadata (($spy.Arguments | Where-Object { $_ -like 'type=bind,*' }) -ceq 'type=bind,src=C:\protected\backup,dst=/backup,readonly') 'backup montado read-only'
    $calls = $spy.Calls; $spy.Running = $true
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -WriteVolume -ReadBackup -InputText 'public' -RestoreOwnership } 'helper rechaza MinIO activo'
    Assert-Metadata ($spy.Calls -eq $calls) 'rechazo antes de Docker'
    $spy.Running = $false
    Assert-MetadataReject { Invoke-PilotHelper 'qa_minio_data' 'C:\protected\backup' 'unused' -WriteVolume -ReadBackup -InputText 'public' -RestoreOwnership } 'helper rechaza volumen ajeno'
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -WriteVolume -InputText 'public' -RestoreOwnership } 'helper rechaza backup escribible'
    $script:PilotScope = 'lan-pilot'
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -WriteVolume -ReadBackup -InputText 'public' -RestoreOwnership } 'helper rechaza CHOWN fuera restore'
    Invoke-PilotHelper $volume 'C:\protected\backup' 'unused'
    Assert-Metadata ($spy.Arguments -notcontains '--cap-add' -and $spy.Arguments -notcontains 'CHOWN') 'backup sin capabilities adicionales'
    $script:PilotProject = 'top-pilot-metadata-unit'; $volume = $script:PilotProject + '_minio_data'
    $script:PilotRoot = 'C:\public\unit-package'
    $backupItems = @([pscustomobject]@{ Name = 'postgres.dump'; FullName = 'C:\protected\backup\postgres.dump'; PSIsContainer = $false }, [pscustomobject]@{ Name = 'postgres-counts.tsv'; FullName = 'C:\protected\backup\postgres-counts.tsv'; PSIsContainer = $false })
    function Resolve-PilotProtectedPath { param($Path, $PackageRoot, [switch]$Directory); return $Path }
    function Get-ChildItem { param($LiteralPath, [switch]$Force, $ErrorAction); return $backupItems }
    function Assert-PilotNoReparse { param($Path) }
    function Assert-PilotRestrictedAcl { param($Path) }
    Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup
    Assert-Metadata ($spy.Arguments -contains 'DAC_READ_SEARCH' -and $spy.Arguments -notcontains 'CHOWN' -and $spy.Arguments -notcontains 'DAC_OVERRIDE' -and $spy.Arguments -notcontains 'FOWNER') 'backup sólo lectura DAC_READ_SEARCH sin write capabilities'
    Assert-Metadata (($spy.Arguments | Where-Object { $_ -like 'type=volume,*' }) -ceq ('type=volume,src=' + $volume + ',dst=/data,readonly')) 'backup origen read-only'
    Assert-Metadata ($spy.Arguments -contains '--read-only' -and $spy.Arguments -contains 'none' -and $spy.Arguments -contains 'no-new-privileges' -and $spy.Arguments -contains 'ALL') 'backup rootfs y red acotados'
    $calls = $spy.Calls
    $spy.Running = $true
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup } 'backup rechaza MinIO activo'
    $spy.Running = $false
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup -WriteVolume } 'backup rechaza volumen escribible'
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup -RestoreOwnership } 'backup rechaza mezclar capabilities'
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup -ReadBackup } 'backup rechaza destino read-only'
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup -InputText 'public' } 'backup rechaza stdin inesperado'
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup,src=other' 'unused' -ReadObjectsBackup } 'backup rechaza mount ambiguo'
    $backupItems += [pscustomobject]@{ Name = 'minio.tar'; FullName = 'C:\protected\backup\minio.tar'; PSIsContainer = $false }
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup } 'backup rechaza destino usado'
    $script:PilotScope = 'restore'
    Assert-MetadataReject { Invoke-PilotHelper $volume 'C:\protected\backup' 'unused' -ReadObjectsBackup } 'backup rechaza scope restore'
    Assert-Metadata ($spy.Calls -eq $calls) 'rechazos backup antes de Docker'
    return [pscustomobject]@{ status = 'PASS'; assertions = $counter.Value; dockerMutation = $false; credentialsWritten = $false; scope = 'ARCHIVE_METADATA_AND_HELPER_BOUNDARY_MOCK' }
}

$metadataTest = Test-PilotRestoreMetadata
$script:PilotTestCount += $metadataTest.assertions

function Test-PilotAuthenticationBoundary {
    $script:PilotProject = 'top-pilot-auth-unit'; $script:PilotScope = 'lan-pilot'
    $state = @{ api = @{ id = 'own-api-unit-id'; state = @{ Running = $true; Health = @{ Status = 'healthy' } } }; gateway = @{ state = @{ Running = $false } } }
    $spy = [pscustomobject]@{ Calls = 0; Arguments = @(); Code = ''; Timeout = 0; ExitCode = 0; Output = "TOP_PILOT_DATABASE_AUTHENTICATED`n"; Throw = $false; Polls = 0; Sleeps = 0; DelayHealth = $false }
    function Assert-PilotRuntime {
        param([switch]$RequireData)
        $spy.Polls++
        if ($spy.DelayHealth) { $state.api.state.Health.Status = $(if ($spy.Polls -lt 3) { 'starting' } else { 'healthy' }) }
        return $state
    }
    function Invoke-PilotDocker {
        param([string[]]$Arguments, [string]$InputText, [string]$Action, [switch]$AllowFailure, [int]$TimeoutSeconds)
        $spy.Calls++; $spy.Arguments = $Arguments; $spy.Code = $InputText; $spy.Timeout = $TimeoutSeconds
        if ($spy.Throw) { throw 'PRIVATE_SENTINEL_VALUE' }
        return [pscustomobject]@{ ExitCode = $spy.ExitCode; Output = $spy.Output }
    }
    function Start-Sleep { param($Seconds); $spy.Sleeps++ }
    Assert-PilotApiDatabaseAuthentication 'own-api-unit-id'
    Assert-PilotTest ($spy.Calls -eq 1 -and $spy.Timeout -eq 20) 'auth SQL exige timeout transporte'
    Assert-PilotTest (($spy.Arguments -join '|') -ceq 'exec|--interactive|own-api-unit-id|node|--input-type=commonjs|-') 'auth SQL usa stdin sin URL/password/código en argv'
    Assert-PilotTest ($spy.Code -ceq (Get-PilotDatabaseAuthenticationCode)) 'auth ejecuta código privado fijo'
    foreach ($output in @('', 'TOP_PILOT_DATABASE_AUTHENTICATED', "TOP_PILOT_DATABASE_AUTHENTICATED`r`n", "TOP_PILOT_DATABASE_AUTHENTICATED`nPRIVATE_SENTINEL_VALUE", "top_pilot_database_authenticated`n")) {
        $spy.Output = $output
        $message = ''
        try { Assert-PilotApiDatabaseAuthentication 'own-api-unit-id' } catch { $message = $_.Exception.Message }
        Assert-PilotTest ($message -ne '' -and -not $message.Contains('PRIVATE_SENTINEL_VALUE')) 'auth rechaza marcador no exacto sin imprimir salida'
    }
    $spy.Output = "TOP_PILOT_DATABASE_AUTHENTICATED`n"; $spy.ExitCode = 1
    Assert-PilotReject { Assert-PilotApiDatabaseAuthentication 'own-api-unit-id' } 'auth rechaza exitcode no cero aun con marcador'
    $spy.ExitCode = 0; $spy.Throw = $true; $message = ''
    try { Assert-PilotApiDatabaseAuthentication 'own-api-unit-id' } catch { $message = $_.Exception.Message }
    Assert-PilotTest ($message -ne '' -and -not $message.Contains('PRIVATE_SENTINEL_VALUE')) 'auth timeout/excepción nunca filtra error'
    $spy.Throw = $false; $before = $spy.Calls
    $state.gateway.state.Running = $true
    Assert-PilotReject { Assert-PilotApiDatabaseAuthentication 'own-api-unit-id' } 'auth rechaza gateway ya publicado'
    $state.gateway.state.Running = $false
    Assert-PilotReject { Assert-PilotApiDatabaseAuthentication 'qa-api-id' } 'auth rechaza API ajeno'
    $state.api.state.Running = $false
    Assert-PilotReject { Assert-PilotApiDatabaseAuthentication 'own-api-unit-id' } 'auth rechaza API detenido'
    $state.api.state.Running = $true; $script:PilotScope = 'restore'
    Assert-PilotReject { Assert-PilotApiDatabaseAuthentication 'own-api-unit-id' } 'auth rechaza clon restore'
    Assert-PilotTest ($spy.Calls -eq $before) 'rechazos auth antes de Docker'
    $script:PilotScope = 'lan-pilot'; $spy.Polls = 0; $spy.DelayHealth = $true
    $id = Wait-PilotApiPrivate 10
    Assert-PilotTest ($id -ceq 'own-api-unit-id' -and $spy.Polls -eq 3 -and $spy.Sleeps -eq 2) 'readiness privado espera API healthy sin publisher'
    $spy.DelayHealth = $false; $state.api.state.Health.Status = 'starting'
    Assert-PilotReject { Wait-PilotApiPrivate 0 } 'readiness privado agotado rechaza publicación'
    $state.gateway.state.Running = $true
    Assert-PilotReject { Wait-PilotApiPrivate 10 } 'readiness rechaza publisher abierto'
    $state.gateway.state.Running = $false; $state.api.state.Running = $false
    Assert-PilotReject { Wait-PilotApiPrivate 10 } 'readiness rechaza API muerto'
}
Test-PilotAuthenticationBoundary

function Test-PilotApplicationRoleBoundary {
    $spy = [pscustomobject]@{ Output = 't'; Sql = ''; Container = ''; Calls = 0 }
    function Invoke-PilotSql([string]$ContainerId, [string]$Sql) { $spy.Calls++; $spy.Sql = $Sql; $spy.Container = $ContainerId; return $spy.Output }
    Assert-PilotApplicationRole 'own-role-unit-id'
    Assert-PilotTest ($spy.Calls -eq 1 -and $spy.Container -ceq 'own-role-unit-id' -and $spy.Sql.Contains('NOT false OR')) 'rol grants admite validación sin LOGIN durante provision'
    Assert-PilotApplicationRole 'own-role-unit-id' -RequireLogin
    Assert-PilotTest ($spy.Sql.Contains('NOT true OR') -and $spy.Sql.Contains('rolpassword IS NOT NULL')) 'rol Start exige LOGIN y password asignada sin leer hash'
    foreach ($response in @('f', '', 'unexpected-private-marker')) {
        $spy.Output = $response
        Assert-PilotReject { Assert-PilotApplicationRole 'own-role-unit-id' -RequireLogin } 'rol catálogo no aprobado bloquea Start'
    }
}
Test-PilotApplicationRoleBoundary

function Test-PilotRoleProvisionBoundary {
    $spy = [pscustomobject]@{ NoClients = $false; Queries = 0; Login = 'f'; Policy = 't'; RejectClients = $false; ProvisionSql = '' }
    function Assert-PilotDatabase([string]$ContainerId, [switch]$NoClients, [switch]$Empty) { $spy.NoClients = $NoClients.IsPresent; if ($spy.RejectClients) { throw 'unit-clients-present'; } }
    function Invoke-PilotSql([string]$ContainerId, [string]$Sql) {
        $spy.Queries++
        if ($Sql.Contains('ALTER ROLE top_pilot_app NOLOGIN')) { $spy.ProvisionSql = $Sql; return '' }
        if ($Sql.StartsWith('SELECT rolcanlogin')) { return $spy.Login }
        return $spy.Policy
    }
    $savedRoot = $script:PilotRoot
    try {
        $script:PilotRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
        Invoke-PilotApplicationRoleProvision 'own-role-unit-id'
        Assert-PilotTest ($spy.NoClients -and $spy.Queries -eq 3 -and $spy.ProvisionSql.Contains('CREATE ROLE top_pilot_app NOLOGIN')) 'provision/restore sin clientes usa SQL fijo y verifica NOLOGIN/política'
        $spy.Login = 't'
        Assert-PilotReject { Invoke-PilotApplicationRoleProvision 'own-role-unit-id' } 'provision/restore rechaza LOGIN activo'
        $spy.Login = 'f'; $spy.Policy = 'f'
        Assert-PilotReject { Invoke-PilotApplicationRoleProvision 'own-role-unit-id' } 'provision/restore rechaza catálogo incorrecto'
        $spy.RejectClients = $true; $before = $spy.Queries
        Assert-PilotReject { Invoke-PilotApplicationRoleProvision 'own-role-unit-id' } 'provision/restore rechaza clientes activos'
        Assert-PilotTest ($spy.Queries -eq $before) 'rechazo clientes antes de ejecutar SQL de permisos'
    } finally { $script:PilotRoot = $savedRoot }
}
Test-PilotRoleProvisionBoundary

foreach ($ip in @('10.0.0.9', '172.16.0.1', '172.31.255.254', '192.168.1.20')) { Assert-PilotTest (Test-PilotPrivateIPv4 $ip) ('RFC1918 ' + $ip) }
foreach ($ip in @('127.0.0.1', '169.254.1.1', '172.15.255.255', '172.32.0.1', '8.8.8.8', '192.168.001.2', '10.1', '0x0a000001', '10.0.0.256', '10.0.0.1 ', '::1')) { Assert-PilotTest (-not (Test-PilotPrivateIPv4 $ip)) ('IP rechazada ' + $ip) }
Assert-PilotProject 'top-pilot-ema'
Assert-PilotProject 'top-pilot-restore-exercise' -Restore
foreach ($project in @('qa', 'top-pilot-', 'top-pilot-restore-existing', 'top-pilot-EMA', 'top-pilot-a/../../b')) { Assert-PilotReject { Assert-PilotProject $project } ('scope ' + $project) }
Assert-PilotReject { Assert-PilotProject 'top-pilot-ema' -Restore } 'restore exclusivo'

$script:PilotRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:PilotProject = 'top-pilot-unit-check'
$script:PilotScope = 'lan-pilot'
$script:PilotEnv = @{
    PILOT_PROJECT = $script:PilotProject
    PILOT_SOURCE_COMMIT = ('a' * 40)
    LAN_IP = '192.168.1.99'
    API_IMAGE = ('local/api@sha256:' + ('0' * 64))
    FRONTEND_IMAGE = ('local/frontend@sha256:' + ('1' * 64))
    POSTGRES_IMAGE = ('postgres@sha256:' + ('2' * 64))
    MINIO_IMAGE = ('minio/minio@sha256:' + ('3' * 64))
    HELPER_IMAGE = ('alpine@sha256:' + ('4' * 64))
    # Literales públicos sólo en memoria: nunca utilizables como credenciales reales.
    POSTGRES_PASSWORD = 'unit-only-no-real-db-credential'
    JWT_ACCESS_SECRET = 'unit-only-no-real-jwt-credential-123456'
    PASSWORD_RESET_OTP_SECRET = 'unit-only-no-real-otp-credential-654321'
    MINIO_ROOT_USER = 'unit-only-root'
    MINIO_ROOT_PASSWORD = 'unit-only-no-real-admin-credential'
    S3_ACCESS_KEY = 'unit-only-bucket-key'
    S3_SECRET_KEY = 'unit-only-no-real-object-credential-7890'
    S3_BUCKET = 'top-pilot-unit-only-bucket'
}
$unitAppPassword = 'unit-only-no-real-app-credential-0123456789'
$script:PilotEnv.DATABASE_URL = 'postgresql://top_pilot_app:' + [Uri]::EscapeDataString($unitAppPassword) + '@postgres:5432/top_pilot?schema=public'
$script:PilotEnv.MIGRATION_DATABASE_URL = 'postgresql://top_pilot:' + [Uri]::EscapeDataString($script:PilotEnv.POSTGRES_PASSWORD) + '@postgres:5432/top_pilot?schema=public'
$text = ($script:PilotEnv.GetEnumerator() | ForEach-Object { $_.Key + '=' + $_.Value }) -join "`n"
$parsed = ConvertFrom-PilotEnvText $text
Assert-PilotTest ($parsed.PILOT_PROJECT -ceq $script:PilotProject) 'parser contrato completo'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text + "`nNODE_ENV=development") } 'rechaza env extra'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text + "`nLAN_IP=10.0.0.2") } 'rechaza env duplicado'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace('192.168.1.99', '8.8.8.8')) } 'rechaza IP pública env'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($script:PilotEnv.API_IMAGE, 'local/api:latest')) } 'rechaza image tag mutable'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($script:PilotEnv.JWT_ACCESS_SECRET, $script:PilotEnv.PASSWORD_RESET_OTP_SECRET)) } 'rechaza secreto JWT/OTP compartido'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($script:PilotEnv.S3_ACCESS_KEY, $script:PilotEnv.MINIO_ROOT_USER)) } 'rechaza app key administrativa'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($script:PilotEnv.MINIO_ROOT_PASSWORD, 'PENDIENTE_CAMBIAR_POR_OPERADOR')) } 'rechaza placeholder'
foreach ($placeholder in @('development-only-credential-1234567890', 'dev_only-credential-1234567890', 'placeholder-credential-1234567890', 'ci_only-credential-1234567890', 'your_credential-needs-change-1234567890', 'test-secret-credential-1234567890', 'cambiar-credential-needs-change-1234567890')) {
    Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($script:PilotEnv.JWT_ACCESS_SECRET, $placeholder)) } 'rechaza JWT de ejemplo conocido'
}
foreach ($placeholder in @('topminio', 'topminiosecret', 'minioadmin')) { Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($script:PilotEnv.MINIO_ROOT_USER, $placeholder)) } 'rechaza admin storage por defecto' }
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace('@postgres:5432', '@localhost:5432')) } 'rechaza DB host ajeno'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace(('DATABASE_URL=' + $script:PilotEnv.DATABASE_URL), ('DATABASE_URL=' + $script:PilotEnv.MIGRATION_DATABASE_URL))) } 'rechaza propietario en conexión API'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace(('MIGRATION_DATABASE_URL=' + $script:PilotEnv.MIGRATION_DATABASE_URL), ('MIGRATION_DATABASE_URL=' + $script:PilotEnv.DATABASE_URL))) } 'rechaza rol API en conexión de migraciones'
foreach ($password in @($script:PilotEnv.POSTGRES_PASSWORD, $script:PilotEnv.JWT_ACCESS_SECRET, 'short', 'example-credential-must-be-replaced-0123456789')) {
    Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($unitAppPassword, $password)) } 'rechaza password API compartida/débil/placeholder'
}
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace('postgresql://top_pilot_app:', 'postgresql://top%5Fpilot%5Fapp:')) } 'rechaza alias URI de rol API'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace($unitAppPassword, '%XX')) } 'rechaza escape de password API inválido'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace('LAN_IP=192.168.1.99', 'LAN_IP=${HOST_IP}')) } 'rechaza interpolación env'
Assert-PilotReject { ConvertFrom-PilotEnvText ($text.Replace('S3_BUCKET=top-pilot-unit-only-bucket', 'S3_BUCKET=app')) } 'rechaza colisión bucket rutas SPA'
Assert-PilotReject { Assert-PilotOutsideGit (Join-Path $script:PilotRoot 'pilot.env') $script:PilotRoot } 'rechaza secretos dentro paquete'
Assert-PilotReject { Assert-PilotOutsideGit (Join-Path (Split-Path (Split-Path $script:PilotRoot -Parent) -Parent) 'private.env') $script:PilotRoot } 'rechaza secretos dentro worktree'
Assert-PilotTest ((ConvertTo-PilotProcessArguments @('C:\path with spaces\', 'a"b', 'x$()')) -ceq '"C:\path with spaces\\" "a\"b" "x$()"') 'quoting Windows sin shell'
Assert-PilotTest ((ConvertFrom-PilotDockerHostPath '/run/desktop/mnt/host/c/Users/Ema/pilot/gateway.conf.template') -ieq 'C:\Users\Ema\pilot\gateway.conf.template') 'normalización Docker Desktop path'

$script:PilotDockerExecutable = (Get-Command docker.exe -ErrorAction Stop).Source
$script:PilotDockerContext = $null
$script:PilotComposePath = Join-Path $script:PilotRoot 'compose.pilot.yml'
# config es una operación cliente de sólo lectura. Los placeholders viven sólo
# en EnvironmentVariables del proceso hijo, no en argv ni archivos.
$model = (Invoke-PilotDocker -Arguments @('compose', '--project-name', $script:PilotProject, '--file', $script:PilotComposePath, '--profile', '*', 'config', '--format', 'json') -Overrides $script:PilotEnv -Action 'config cliente de prueba').Output
function Invoke-PilotCompose([string[]]$Arguments, [string]$Action, [switch]$AllowFailure) { return [pscustomobject]@{ ExitCode = 0; Output = $script:PilotTestModel } }
$script:PilotTestModel = $model
Assert-PilotComposePolicy
Assert-PilotTest $true 'política acepta compose real piloto'
function Test-PilotModelMutation([scriptblock]$Mutation, [string]$Name) {
    $script:PilotMutableModel = $model | ConvertFrom-Json
    & $Mutation
    $script:PilotTestModel = $script:PilotMutableModel | ConvertTo-Json -Depth 30
    Assert-PilotReject { Assert-PilotComposePolicy } $Name
}
Test-PilotModelMutation { $script:PilotMutableModel.services.gateway.ports[0].host_ip = '0.0.0.0' } 'rechaza gateway wildcard efectivo'
Test-PilotModelMutation { $script:PilotMutableModel.services.postgres | Add-Member -NotePropertyName ports -NotePropertyValue @(@{ published = '5432'; target = 5432; host_ip = '127.0.0.1'; protocol = 'tcp' }) -Force } 'rechaza puerto DB efectivo'
Test-PilotModelMutation { $script:PilotMutableModel.networks.app.internal = $false } 'rechaza app egress'
Test-PilotModelMutation { $script:PilotMutableModel.volumes.postgres_data.name = 'qa_postgres_data' } 'rechaza volumen QA'
Test-PilotModelMutation { $script:PilotMutableModel.services.api.environment.EMAIL_DELIVERY_MODE = 'console' } 'rechaza OTP console'
Test-PilotModelMutation { $script:PilotMutableModel.services.api.environment.NODE_ENV = 'development' } 'rechaza auth development'
Test-PilotModelMutation { $script:PilotMutableModel.services.api.environment.CORS_ORIGIN = 'http://192.168.1.99:3001,http://evil:3001' } 'rechaza CORS extra'
Test-PilotModelMutation { $script:PilotMutableModel.services.api.environment | Add-Member -NotePropertyName MINIO_ROOT_PASSWORD -NotePropertyValue 'private-output-not-for-display' -Force } 'rechaza root env API'
Test-PilotModelMutation { $script:PilotMutableModel.services.api.environment | Add-Member -NotePropertyName MIGRATION_DATABASE_URL -NotePropertyValue $script:PilotEnv.MIGRATION_DATABASE_URL -Force } 'rechaza conexión owner expuesta a API'
Test-PilotModelMutation { $script:PilotMutableModel.services.api.environment.DATABASE_URL = $script:PilotEnv.MIGRATION_DATABASE_URL } 'rechaza owner como conexión API efectiva'
Test-PilotModelMutation { $script:PilotMutableModel.services.migrate.environment.DATABASE_URL = $script:PilotEnv.DATABASE_URL } 'rechaza conexión API en migrador efectivo'
Test-PilotModelMutation { $script:PilotMutableModel.services.gateway.volumes[0].read_only = $false } 'rechaza template writable'
Test-PilotModelMutation { $script:PilotMutableModel.services.minio | Add-Member -NotePropertyName privileged -NotePropertyValue $true -Force } 'rechaza privilegios efectivos'
Test-PilotModelMutation { $script:PilotMutableModel.services.migrate.networks | Add-Member -NotePropertyName ingress -NotePropertyValue @{} -Force } 'rechaza migrador ingress'

$script:PilotProject = 'top-pilot-restore-unit-check'
$script:PilotScope = 'restore'
$restoreOverrides = @{} + $script:PilotEnv
$restoreOverrides.PILOT_PROJECT = $script:PilotProject
$restoreModel = (Invoke-PilotDocker -Arguments @('compose', '--project-name', $script:PilotProject, '--file', (Join-Path $script:PilotRoot 'compose.restore.yml'), 'config', '--format', 'json') -Overrides $restoreOverrides -Action 'config cliente restore de prueba').Output
$script:PilotTestModel = $restoreModel
Assert-PilotComposePolicy -Restore
Assert-PilotTest $true 'política acepta compose real restore'
$badRestore = $restoreModel | ConvertFrom-Json
$badRestore.services.minio | Add-Member -NotePropertyName ports -NotePropertyValue @(@{ published = '9000'; target = 9000; protocol = 'tcp' }) -Force
$script:PilotTestModel = $badRestore | ConvertTo-Json -Depth 30
Assert-PilotReject { Assert-PilotComposePolicy -Restore } 'rechaza exposición restore'

# Verificar captura y descarte de stderr y aislamiento frente a env heredado.
$script:PilotDockerExecutable = (Get-Command powershell.exe -ErrorAction Stop).Source
$script:PilotDockerContext = $null
$originalProjectEnv = [Environment]::GetEnvironmentVariable('PILOT_PROJECT', 'Process')
$originalComposeEnv = [Environment]::GetEnvironmentVariable('COMPOSE_FILE', 'Process')
try {
    [Environment]::SetEnvironmentVariable('PILOT_PROJECT', 'untrusted-shell-project', 'Process')
    [Environment]::SetEnvironmentVariable('COMPOSE_FILE', 'untrusted-shell-compose', 'Process')
    $child = Invoke-PilotDocker -Arguments @('-NoProfile', '-NonInteractive', '-Command', '[Console]::Write([int]($null -eq $env:PILOT_PROJECT -and $null -eq $env:COMPOSE_FILE))') -Action 'prueba aislamiento proceso'
    Assert-PilotTest ($child.Output -ceq '1') 'env shell no sustituye config protegida'
    $message = ''
    try { [void](Invoke-PilotDocker -Arguments @('-NoProfile', '-NonInteractive', '-Command', '[Console]::Error.Write("PRIVATE_STDERR_SENTINEL"); exit 7') -Action 'prueba error genérico') } catch { $message = $_.Exception.Message }
    Assert-PilotTest ($message.Contains('Código 7') -and -not $message.Contains('PRIVATE_STDERR_SENTINEL')) 'stderr sensible no aparece en excepción'
} finally {
    [Environment]::SetEnvironmentVariable('PILOT_PROJECT', $originalProjectEnv, 'Process')
    [Environment]::SetEnvironmentVariable('COMPOSE_FILE', $originalComposeEnv, 'Process')
}

# El estado existente debe verificarse aunque Compose use --no-recreate: imagen y
# labels iguales no acreditan que env, red, logging o mounts sigan siendo seguros.
$script:PilotProject = $script:PilotEnv.PILOT_PROJECT
$script:PilotScope = 'lan-pilot'
$script:PilotImageIds = @{ API_IMAGE = ('sha256:' + ('0' * 64)); FRONTEND_IMAGE = ('sha256:' + ('1' * 64)); POSTGRES_IMAGE = ('sha256:' + ('2' * 64)); MINIO_IMAGE = ('sha256:' + ('3' * 64)); HELPER_IMAGE = ('sha256:' + ('4' * 64)) }
$origin = 'http://' + $script:PilotEnv.LAN_IP + ':3001'
$baseEnvironment = @{
    postgres = @{ POSTGRES_USER = 'top_pilot'; POSTGRES_DB = 'top_pilot'; POSTGRES_PASSWORD = $script:PilotEnv.POSTGRES_PASSWORD }
    minio = @{ MINIO_ROOT_USER = $script:PilotEnv.MINIO_ROOT_USER; MINIO_ROOT_PASSWORD = $script:PilotEnv.MINIO_ROOT_PASSWORD }
    gateway = @{ LAN_IP = $script:PilotEnv.LAN_IP; S3_BUCKET = $script:PilotEnv.S3_BUCKET; NGINX_ENVSUBST_FILTER = '^(LAN_IP|S3_BUCKET)$' }
    api = @{ NODE_ENV = 'production'; TOP_DEPLOYMENT_PROFILE = 'lan-pilot'; EMAIL_DELIVERY_MODE = 'disabled'; DATABASE_URL = $script:PilotEnv.DATABASE_URL; JWT_ACCESS_SECRET = $script:PilotEnv.JWT_ACCESS_SECRET; PASSWORD_RESET_OTP_SECRET = $script:PilotEnv.PASSWORD_RESET_OTP_SECRET; APP_PUBLIC_URL = $origin; CORS_ORIGIN = $origin; S3_PUBLIC_ENDPOINT = $origin; S3_ENDPOINT = 'http://minio:9000'; S3_BUCKET = $script:PilotEnv.S3_BUCKET; S3_ACCESS_KEY = $script:PilotEnv.S3_ACCESS_KEY; S3_SECRET_KEY = $script:PilotEnv.S3_SECRET_KEY; S3_FORCE_PATH_STYLE = 'true' }
}
$baseRecords = @()
$imageKeys = @{ postgres = 'POSTGRES_IMAGE'; minio = 'MINIO_IMAGE'; api = 'API_IMAGE'; gateway = 'FRONTEND_IMAGE' }
foreach ($service in @('postgres', 'minio', 'api', 'gateway')) {
    $networkNames = @('app'); if ($service -eq 'postgres') { $networkNames = @('db') }; if ($service -eq 'api') { $networkNames = @('app', 'db') }; if ($service -eq 'gateway') { $networkNames = @('app', 'ingress') }
    $networks = @{}; foreach ($network in $networkNames) { $networks[$script:PilotProject + '_' + $network] = @{} }
    $mounts = @(); $ports = @{}
    if ($service -in @('postgres', 'minio')) {
        $volume = 'postgres_data'; $target = '/var/lib/postgresql/data'; if ($service -eq 'minio') { $volume = 'minio_data'; $target = '/data' }
        $mounts = @(@{ Type = 'volume'; Name = ($script:PilotProject + '_' + $volume); Destination = $target })
    } elseif ($service -eq 'gateway') {
        $mounts = @(@{ Type = 'bind'; Source = (Join-Path $script:PilotRoot 'gateway.conf.template'); Destination = '/etc/nginx/templates/default.conf.template'; RW = $false })
        $ports = @{ '80/tcp' = @(@{ HostIp = $script:PilotEnv.LAN_IP; HostPort = '3001' }) }
    }
    $baseRecords += @{ id = ($service + '-unit-id'); service = @{ 'com.docker.compose.project' = $script:PilotProject; 'com.docker.compose.service' = $service; 'com.top.pilot.scope' = 'lan-pilot'; 'com.top.pilot.source' = $script:PilotEnv.PILOT_SOURCE_COMMIT }; image = $script:PilotImageIds[$imageKeys[$service]]; state = @{ Running = $false }; mounts = $mounts; ports = $ports; networks = $networks; logging = 'none'; privileged = $false; capAdd = $null; devices = @(); networkMode = ($script:PilotProject + '_' + $networkNames[0]) }
}
$runtimeBaseJson = $baseRecords | ConvertTo-Json -Depth 15
$environmentBaseJson = $baseEnvironment | ConvertTo-Json -Depth 5
function Reset-PilotTestRuntime {
    $script:PilotTestRuntimeRecords = $runtimeBaseJson | ConvertFrom-Json
    $script:PilotTestRuntimeEnvironment = $environmentBaseJson | ConvertFrom-Json
    $script:PilotTestNetworkInternal = $true
    $script:PilotTestNetworkScope = 'lan-pilot'
    $script:PilotTestVolumeProject = $script:PilotProject
    $script:PilotTestForeignConsumer = $false
    $script:PilotTestForeignNetworkMember = $false
}
function Get-PilotContainers { return $script:PilotTestRuntimeRecords }
function Invoke-PilotDocker([string[]]$Arguments, [string]$InputText, [string]$Action, [switch]$AllowFailure, [hashtable]$Overrides) {
    $result = ''
    if ($Arguments[0] -eq 'inspect') {
        $record = $script:PilotTestRuntimeRecords | Where-Object { $_.id -ceq $Arguments[3] }
        if (-not $record) { throw 'Mock: contenedor desconocido.' }
        $service = $record.service.'com.docker.compose.service'
        $result = @($script:PilotTestRuntimeEnvironment.$service.PSObject.Properties | ForEach-Object { $_.Name + '=' + $_.Value }) | ConvertTo-Json -Compress
    } elseif ($Arguments[0] -eq 'volume') {
        $volume = $Arguments[2].Substring($script:PilotProject.Length + 1)
        $result = @{ 'com.docker.compose.project' = $script:PilotTestVolumeProject; 'com.docker.compose.volume' = $volume; 'com.top.pilot.scope' = 'lan-pilot'; 'com.top.pilot.source' = $script:PilotEnv.PILOT_SOURCE_COMMIT } | ConvertTo-Json -Compress
    } elseif ($Arguments[0] -eq 'network') {
        $members = @{}; if ($script:PilotTestForeignNetworkMember) { $members['qa-foreign-network-member'] = @{} }
        $result = @{ id = 'own-unit-network'; containers = $members; internal = $script:PilotTestNetworkInternal; labels = @{ 'com.docker.compose.project' = $script:PilotProject; 'com.top.pilot.scope' = $script:PilotTestNetworkScope; 'com.top.pilot.source' = $script:PilotEnv.PILOT_SOURCE_COMMIT } } | ConvertTo-Json -Compress -Depth 4
    } elseif ($Arguments[0] -eq 'ps') {
        $service = 'postgres'; if ($Arguments[-1].EndsWith('_minio_data')) { $service = 'minio' }
        $result = $service + '-unit-id'
        if ($script:PilotTestForeignConsumer) { $result += "`nqa-foreign-consumer" }
    } else { throw 'Mock: comando nativo inesperado; no ejecutarlo.' }
    return [pscustomobject]@{ ExitCode = 0; Output = $result }
}
function Test-PilotRuntimeMutation([scriptblock]$Mutation, [string]$Name) {
    Reset-PilotTestRuntime
    & $Mutation
    $message = ''
    try { [void](Assert-PilotRuntime -RequireData) } catch { $message = $_.Exception.Message }
    Assert-PilotTest (-not [string]::IsNullOrEmpty($message)) $Name
    Assert-PilotTest (-not $message.Contains('PRIVATE_SENTINEL_VALUE')) ($Name + ' sin filtrar valor')
}
Reset-PilotTestRuntime
[void](Assert-PilotRuntime -RequireData)
Assert-PilotTest $true 'runtime seguro pasa con fixtures propios'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.api.NODE_ENV = 'development' } 'runtime rechaza development viejo'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.api.EMAIL_DELIVERY_MODE = 'console' } 'runtime rechaza correo console viejo'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.api.CORS_ORIGIN = 'http://PRIVATE_SENTINEL_VALUE:3001' } 'runtime rechaza origen viejo'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.api | Add-Member -NotePropertyName MINIO_ROOT_PASSWORD -NotePropertyValue 'PRIVATE_SENTINEL_VALUE' -Force } 'runtime rechaza root cred API'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.api | Add-Member -NotePropertyName MIGRATION_DATABASE_URL -NotePropertyValue 'PRIVATE_SENTINEL_VALUE' -Force } 'runtime rechaza conexión mantenimiento expuesta a API'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.api.DATABASE_URL = $script:PilotEnv.MIGRATION_DATABASE_URL } 'runtime rechaza propietario usado por API'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.postgres.POSTGRES_PASSWORD = 'PRIVATE_SENTINEL_VALUE' } 'runtime rechaza DB cred vieja'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.minio.MINIO_ROOT_PASSWORD = 'PRIVATE_SENTINEL_VALUE' } 'runtime rechaza MinIO cred vieja'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeEnvironment.gateway.LAN_IP = '10.0.0.2' } 'runtime rechaza gateway IP vieja'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeRecords[2].logging = 'json-file' } 'runtime rechaza logging inesperado'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeRecords[2].privileged = $true } 'runtime rechaza privileged'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeRecords[2].networks | Add-Member -NotePropertyName qa_default -NotePropertyValue @{} -Force } 'runtime rechaza red ajena'
Test-PilotRuntimeMutation { $script:PilotTestNetworkInternal = $false } 'runtime rechaza red app externa'
Test-PilotRuntimeMutation { $script:PilotTestNetworkScope = 'qa' } 'runtime rechaza label de red ajena'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeRecords[3].mounts[0].Source = 'C:\Users\Ema\QA\gateway.conf.template' } 'runtime rechaza template ajeno'
Test-PilotRuntimeMutation { $script:PilotTestVolumeProject = 'qa' } 'runtime rechaza volumen ajeno'
Test-PilotRuntimeMutation { $script:PilotTestForeignConsumer = $true } 'runtime rechaza consumidor QA de volumen'
Test-PilotRuntimeMutation { $script:PilotTestForeignNetworkMember = $true } 'runtime rechaza consumidor QA de red'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeRecords[3].ports.'80/tcp'[0].HostIp = '0.0.0.0' } 'runtime rechaza bind wildcard'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeRecords[2].ports | Add-Member -NotePropertyName '3000/tcp' -NotePropertyValue @(@{ HostIp = '0.0.0.0'; HostPort = '3000' }) -Force } 'runtime rechaza API expuesta'
Test-PilotRuntimeMutation { $script:PilotTestRuntimeRecords[2].networkMode = 'host' } 'runtime rechaza network_mode host'
function Get-NetTCPConnection { param($State, $LocalPort, $ErrorAction); return $script:PilotTestListeners }
$script:PilotTestListeners = @([pscustomobject]@{ LocalAddress = $script:PilotEnv.LAN_IP; LocalPort = 3001 })
Assert-PilotListener
Assert-PilotTest $true 'listener Windows único correcto'
foreach ($address in @('0.0.0.0', '::', '127.0.0.1', '10.0.0.2', '::ffff:192.168.1.99')) {
    $script:PilotTestListeners = @([pscustomobject]@{ LocalAddress = $address; LocalPort = 3001 })
    Assert-PilotReject { Assert-PilotListener } 'rechaza listener Windows amplio o ajeno'
}
$script:PilotTestListeners = @()
Assert-PilotReject { Assert-PilotListener } 'rechaza listener Windows no acreditado'
$script:PilotTestListeners = @([pscustomobject]@{ LocalAddress = $script:PilotEnv.LAN_IP; LocalPort = 3001 }, [pscustomobject]@{ LocalAddress = '::'; LocalPort = 3001 })
Assert-PilotReject { Assert-PilotListener } 'rechaza listener IPv6 inesperado adicional'

function Get-Acl { param($LiteralPath, $ErrorAction); return [pscustomobject]@{ Access = $script:PilotTestAclRules } }
function New-PilotTestAce([string]$Sid, [Security.AccessControl.FileSystemRights]$Rights) {
    return [pscustomobject]@{ AccessControlType = [Security.AccessControl.AccessControlType]::Allow; IdentityReference = (New-Object Security.Principal.SecurityIdentifier($Sid)); FileSystemRights = $Rights }
}
$script:PilotTestAclRules = @((New-PilotTestAce ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value) FullControl), (New-PilotTestAce 'S-1-5-18' FullControl), (New-PilotTestAce 'S-1-5-32-544' FullControl))
Assert-PilotRestrictedAcl 'unit-only-no-file-created'
Assert-PilotTest $true 'ACL operador SYSTEM Administrators aceptada'
foreach ($right in @('ReadData', 'WriteData', 'AppendData', 'WriteAttributes', 'Delete', 'ChangePermissions', 'TakeOwnership', 'ExecuteFile', 'DeleteSubdirectoriesAndFiles')) {
    $script:PilotTestAclRules = @((New-PilotTestAce 'S-1-1-0' ([Security.AccessControl.FileSystemRights]$right)))
    Assert-PilotReject { Assert-PilotRestrictedAcl 'unit-only-no-file-created' } 'ACL Everyone con permiso sensible rechazada'
}
[pscustomobject]@{ status = 'PASS'; assertions = $script:PilotTestCount; dockerMutation = $false; credentialsWritten = $false; note = 'Pruebas cliente y negativas de política. Backup/restore real y host Ema no ejecutados por esta suite.' }
