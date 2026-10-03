[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [switch]$AcceptHttpRisk,
    [switch]$AccountReady,
    [switch]$ReleaseApproved,
    [ValidateRange(10, 300)][int]$ReadyTimeoutSeconds = 120
)
. (Join-Path $PSScriptRoot 'Common.ps1')

if (-not $AcceptHttpRisk -or -not $AccountReady -or -not $ReleaseApproved) { throw 'El operador debe confirmar riesgo HTTP, cuenta verificada ya presente y release revisado mediante los tres flags. HTTP transmite credenciales y datos sin cifrar.' }
Initialize-Pilot -EnvPath $EnvPath
Assert-PilotManifest -Approved
Assert-PilotLan
[void](Assert-PilotRuntime)
Assert-PilotPortFree
. (Join-Path $PSScriptRoot 'InspectFirewall.ps1') -EnvPath $EnvPath -AlreadyInitialized

try {
    [void](Invoke-PilotCompose -Arguments @('stop', '--timeout', '30', 'gateway') -Action 'cierre del gateway propio antes de autenticar SQL')
    $state = Assert-PilotRuntime
    if ($state.ContainsKey('gateway') -and $state.gateway.state.Running) { throw 'El gateway propio sigue activo; no avanzar con el arranque.' }
    [void](Invoke-PilotCompose -Arguments @('up', '--detach', '--no-build', '--no-recreate', '--pull', 'never', 'postgres', 'minio') -Action 'arranque de datos propios')
    Wait-PilotData $ReadyTimeoutSeconds
    $state = Assert-PilotRuntime -RequireData
    Assert-PilotDatabase $state.postgres.id
    Assert-PilotApplicationRole $state.postgres.id -RequireLogin
    [void](Invoke-PilotCompose -Arguments @('up', '--detach', '--no-build', '--no-recreate', '--no-deps', '--pull', 'never', 'api') -Action 'arranque privado del API propio')
    $apiId = Wait-PilotApiPrivate $ReadyTimeoutSeconds
    Assert-PilotApiDatabaseAuthentication $apiId
    [void](Invoke-PilotCompose -Arguments @('up', '--detach', '--no-build', '--no-recreate', '--no-deps', '--pull', 'never', 'gateway') -Action 'publicación del gateway tras autenticación SQL comprobada')
    $limit = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    $ready = $false
    do {
        $state = Assert-PilotRuntime -RequireData
        if (-not $state.api.state.Running -or -not $state.gateway.state.Running) { throw 'API o gateway se detuvieron durante readiness; detalles sensibles omitidos.' }
        try {
            $response = Invoke-WebRequest -Uri ('http://' + $script:PilotEnv.LAN_IP + ':3001/api/health') -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $limit)
    if (-not $ready) { throw 'El gateway no respondió health 200 dentro del límite; no habilitar uso real.' }
    Assert-PilotListener
    [pscustomobject]@{ status = 'STARTED_SQL_AUTHENTICATED_HEALTH_200'; project = $script:PilotProject; origin = ('http://' + $script:PilotEnv.LAN_IP + ':3001'); note = 'API autenticó PostgreSQL como top_pilot_app en top_pilot antes de publicar. Sin migraciones automáticas. Verificar UI, login autorizado, objetos y acceso móvil/desktop en la Wi-Fi real.' }
} catch {
    # Detener sólo admisión y escrituras de este proyecto. Volúmenes y datos permanecen.
    $stop = Invoke-PilotCompose -Arguments @('stop', '--timeout', '30', 'gateway', 'api') -Action 'cierre del proyecto tras arranque fallido' -AllowFailure
    if ($stop.ExitCode -ne 0) { throw 'No se confirmó el cierre de API/gateway tras arranque fallido; revisar localmente. Datos preservados, detalles sensibles omitidos.' }
    $closed = Assert-PilotRuntime
    if (@($closed.Values | Where-Object { $_.service.'com.docker.compose.service' -in @('api', 'gateway') -and $_.state.Running }).Count -ne 0) { throw 'API/gateway siguen activos tras arranque fallido; revisar localmente. Datos preservados, detalles sensibles omitidos.' }
    throw 'El arranque no terminó correctamente; API/gateway propios quedaron detenidos. Base, objetos y volúmenes se preservan; detalles sensibles omitidos.'
}
