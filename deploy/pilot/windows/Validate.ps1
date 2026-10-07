[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$EnvPath)
. (Join-Path $PSScriptRoot 'Common.ps1')

Initialize-Pilot -EnvPath $EnvPath
Assert-PilotLan
[void](Assert-PilotRuntime)
Assert-PilotPortFree
. (Join-Path $PSScriptRoot 'InspectFirewall.ps1') -EnvPath $EnvPath -AlreadyInitialized
[pscustomobject]@{
    status = 'VALIDATED_NOT_STARTED'
    project = $script:PilotProject
    sourceCommit = $script:PilotEnv.PILOT_SOURCE_COMMIT
    origin = ('http://' + $script:PilotEnv.LAN_IP + ':3001')
    interface = $script:PilotInterfaceAlias
    releaseApproved = ($script:PilotManifest.releaseApproved -eq $true)
    note = 'Validación local de configuración; no acredita acceso desde otro dispositivo, cuenta, datos ni restore.'
}
