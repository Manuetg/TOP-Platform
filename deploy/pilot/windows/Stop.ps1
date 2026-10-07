[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$EnvPath)
. (Join-Path $PSScriptRoot 'Common.ps1')

Initialize-Pilot -EnvPath $EnvPath
[void](Assert-PilotRuntime)
[void](Invoke-PilotCompose -Arguments @('stop', '--timeout', '30') -Action 'parada exclusiva del piloto')
$state = Assert-PilotRuntime
if (@($state.Values | Where-Object { $_.state.Running }).Count -ne 0) { throw 'Algún contenedor propio sigue ejecutándose; revisar localmente. Datos preservados.' }
[pscustomobject]@{ status = 'STOPPED_VOLUMES_PRESERVED'; project = $script:PilotProject }
