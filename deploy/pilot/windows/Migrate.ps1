[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [switch]$MaintenanceApproved,
    [ValidateRange(10, 300)][int]$ReadyTimeoutSeconds = 120
)
. (Join-Path $PSScriptRoot 'Common.ps1')

if (-not $MaintenanceApproved) { throw 'La aplicación de migraciones requiere una ventana de mantenimiento aprobada y respaldo previo si ya hay datos.' }
Initialize-Pilot -EnvPath $EnvPath
Assert-PilotManifest -Approved
$state = Assert-PilotRuntime
if (@($state.Values | Where-Object { $_.service.'com.docker.compose.service' -in @('api', 'gateway') -and $_.state.Running }).Count -gt 0) { throw 'Detener gateway/API propios y respaldar antes de aplicar migraciones.' }
[void](Invoke-PilotCompose -Arguments @('up', '--detach', '--no-build', '--no-recreate', '--pull', 'never', 'postgres', 'minio') -Action 'arranque privado de infraestructura para mantenimiento')
Wait-PilotData $ReadyTimeoutSeconds
$state = Assert-PilotRuntime -RequireData
Assert-PilotDatabase $state.postgres.id -NoClients
[void](Invoke-PilotCompose -Arguments @('--profile', 'maintenance', 'run', '--rm', '--no-deps', '--pull', 'never', 'migrate') -Action 'migrate deploy explícito de este proyecto')
[pscustomobject]@{ status = 'MIGRATIONS_APPLIED_APPLICATION_STOPPED'; project = $script:PilotProject; note = 'Conexión propietaria sólo para mantenimiento. Ejecutar Provision-AppRole explícitamente y revisión local de LOGIN antes de Start; no se crean cuentas, membresías, catálogos ni fixtures.' }
