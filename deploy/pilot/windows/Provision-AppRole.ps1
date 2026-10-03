[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [switch]$MaintenanceApproved,
    [switch]$ReleaseApproved
)
. (Join-Path $PSScriptRoot 'Common.ps1')

if (-not $MaintenanceApproved -or -not $ReleaseApproved) { throw 'El operador debe confirmar mantenimiento y release revisado. El aprovisionamiento deja la aplicación sin LOGIN y detenida.' }
Initialize-Pilot -EnvPath $EnvPath
Assert-PilotManifest -Approved
$state = Assert-PilotRuntime -RequireData
if (($state.api -and $state.api.state.Running) -or ($state.gateway -and $state.gateway.state.Running)) { throw 'Detener API/gateway propios antes de cambiar permisos. El script no detiene ni recrea servicios.' }
Invoke-PilotApplicationRoleProvision $state.postgres.id
[pscustomobject]@{
    status = 'APP_ROLE_PROVISIONED_LOGIN_DISABLED'
    project = $script:PilotProject
    postgresContainer = $state.postgres.id
    dockerContext = $script:PilotDockerContext
    note = 'Sin contraseña asignada por el script. El operador local debe usar psql \password top_pilot_app con su contraseña del DATABASE_URL protegido, activar LOGIN explícitamente y validar la política antes de Start. Repetir tras restore --no-privileges; el clon de restore no arranca aplicación.'
}
