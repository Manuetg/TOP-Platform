[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [switch]$AlreadyInitialized
)
if (-not $AlreadyInitialized) {
    . (Join-Path $PSScriptRoot 'Common.ps1')
    Initialize-Pilot -EnvPath $EnvPath
    Assert-PilotLan
}

function Test-PilotFirewallPort([object]$Ports) {
    foreach ($port in @($Ports)) {
        if ([string]$port -in @('Any', '3001')) { return $true }
        if ([string]$port -match '^(\d+)-(\d+)$' -and [int]$Matches[1] -le 3001 -and [int]$Matches[2] -ge 3001) { return $true }
    }
    return $false
}

# Sólo lecturas: nunca New/Set/Remove-NetFirewallRule ni cambios de perfil.
try {
    $private = Get-NetFirewallProfile -Name Private -PolicyStore ActiveStore -ErrorAction Stop
    if (-not $private.Enabled -or [string]$private.DefaultInboundAction -eq 'Allow') { throw 'El perfil Private no tiene firewall activo con entrada bloqueada por defecto.' }
    $rules = @(Get-NetFirewallRule -PolicyStore ActiveStore -Enabled True -Direction Inbound -Action Allow -ErrorAction Stop | Where-Object { [string]$_.Profile -match 'Private|Any' })
    $relevant = @()
    foreach ($rule in $rules) {
        $filter = $rule | Get-NetFirewallPortFilter -ErrorAction Stop
        if ([string]$filter.Protocol -notin @('TCP', '6', 'Any', '256') -or -not (Test-PilotFirewallPort $filter.LocalPort)) { continue }
        $addresses = $rule | Get-NetFirewallAddressFilter -ErrorAction Stop
        $application = $rule | Get-NetFirewallApplicationFilter -ErrorAction Stop
        $relevant += [pscustomobject]@{
            name = $rule.Name
            displayName = $rule.DisplayName
            profile = [string]$rule.Profile
            localPort = (@($filter.LocalPort) -join ',')
            localAddress = (@($addresses.LocalAddress) -join ',')
            remoteAddress = (@($addresses.RemoteAddress) -join ',')
            program = $application.Program
            broadRemoteScope = (@($addresses.RemoteAddress | Where-Object { [string]$_ -in @('Any', 'LocalSubnet', 'Internet') }).Count -gt 0)
        }
    }
    [pscustomobject]@{
        status = 'READ_ONLY_REVIEW_REQUIRED'
        privateFirewallEnabled = [bool]$private.Enabled
        defaultInboundAction = [string]$private.DefaultInboundAction
        interface = $script:PilotInterfaceAlias
        possibleInboundAllowRules = $relevant
        note = 'Son reglas potenciales; revisar programa, interfaces, direcciones y precedencia localmente. Una allow estrecha no neutraliza otra amplia. No se modificó firewall ni red.'
    }
} catch { throw 'No se completó la inspección de firewall o el perfil no está protegido. Revisar localmente sin modificar reglas automáticamente.' }
