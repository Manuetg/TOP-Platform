[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [switch]$MaintenanceApproved,
    [switch]$ReleaseApproved,
    [ValidateRange(10, 300)][int]$ReadyTimeoutSeconds = 120
)
. (Join-Path $PSScriptRoot 'Common.ps1')

if (-not $MaintenanceApproved -or -not $ReleaseApproved) { throw 'La preparación privada requiere mantenimiento y release aprobados por el operador.' }
Initialize-Pilot -EnvPath $EnvPath
Assert-PilotManifest -Approved
$state = Assert-PilotRuntime
if (@($state.Values | Where-Object { $_.service.'com.docker.compose.service' -in @('api', 'gateway') -and $_.state.Running }).Count -gt 0) { throw 'Detener gateway/API propios antes de preparar datos.' }
[void](Invoke-PilotCompose -Arguments @('up', '--detach', '--no-build', '--no-recreate', '--pull', 'never', 'postgres', 'minio') -Action 'arranque privado de PostgreSQL y MinIO propios')
Wait-PilotData $ReadyTimeoutSeconds
$state = Assert-PilotRuntime -RequireData
Assert-PilotDatabase $state.postgres.id
[pscustomobject]@{ status = 'DATA_READY_NO_HOST_PORTS'; project = $script:PilotProject; note = 'API/gateway permanecen detenidos. No se aplicaron migraciones, catálogos, bucket/política, cuentas ni credenciales. Esos pasos requieren los procedimientos aprobados del operador.' }
