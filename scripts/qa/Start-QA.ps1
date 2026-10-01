param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [Parameter(Mandatory = $true)][string]$NpmCliPath,
    [Parameter(Mandatory = $true)][string]$PgContainerId,
    [Parameter(Mandatory = $true)][string]$PgName,
    [Parameter(Mandatory = $true)][string]$PgRunId,
    [switch]$LanzarQA,
    [switch]$DevelopmentFrontend
)
if (-not $LanzarQA) { throw 'Indicar -LanzarQA solo para iniciar la reproducción autorizada.' }
. (Join-Path $PSScriptRoot 'Common.ps1')
Initialize-QaPaths $RepoRoot $NodeExecutable $NpmCliPath
Set-QaSyntheticEnvironment 'test'
Assert-QaGitClean
Assert-QaPostgresOwnership $PgContainerId $PgName $PgRunId
$apiMain = Resolve-QaFile (Join-Path $QaBackendRoot 'dist\src\main.js')
$vite = Resolve-QaFile (Join-Path $QaFrontendRoot 'node_modules\vite\bin\vite.js')
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'qa-fixtures.json'))) { throw 'Ejecutar el seed QA después de gates antes de arrancar.' }
$busyPorts = @(Get-NetTCPConnection -LocalPort 3047,4177 -State Listen -ErrorAction SilentlyContinue)
if ($busyPorts.Count -ne 0) { throw '3047/4177 ocupados; no se reutiliza ni detiene otro proceso.' }
if (-not $DevelopmentFrontend) {
    Resolve-QaFile (Join-Path $QaFrontendRoot 'dist\index.html') | Out-Null
    $expectedApiFound = $false
    foreach ($asset in @(Get-ChildItem -LiteralPath (Join-Path $QaFrontendRoot 'dist\assets') -Filter '*.js' -File)) {
        $content = Get-Content -LiteralPath $asset.FullName -Raw -Encoding UTF8
        if ($content.Contains('http://localhost:3000/api')) { throw 'Build apunta a otra API; reconstruir con VITE_API_URL de QA.' }
        if ($content.Contains('http://127.0.0.1:3047/api')) { $expectedApiFound = $true }
    }
    if (-not $expectedApiFound) { throw 'Falta URL QA en build frontend.' }
}
Invoke-QaNode -Arguments @((Join-Path $PSScriptRoot 'Check-QADatabase.cjs'))
# Bootstrap normal de la aplicación: modo development con configuración sintética.
Set-QaSyntheticEnvironment 'development'
$runRoot = Join-Path $PSScriptRoot ('runs\runtime-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'))
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$manifestPath = Join-Path $runRoot 'processes.json'
$manifest = [ordered]@{ owner = 'top-portable-qa-v1'; packageRoot = [IO.Path]::GetFullPath($PSScriptRoot); repoRoot = $QaRepoRoot; nodeExecutable = $QaNodeExecutable; createdAt = (Get-Date).ToUniversalTime().ToString('o'); status = 'starting'; api = 'http://127.0.0.1:3047/api'; frontend = 'http://127.0.0.1:4177'; nodeEnv = 'development'; bootstrap = 'backend/dist/src/main.js'; processes = @(); limitation = 'Bootstrap normal; app.listen actual no fija interfaz loopback. Usar equipo QA dedicado/red restringida. Sin smoke fresco de este paquete.' }
$manifest.frontendMode = if ($DevelopmentFrontend) { 'dev' } else { 'preview' }
function Save-QaManifest { $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8 }
function Start-QaNode([string]$Role, [string[]]$Arguments, [string]$WorkingDirectory) {
    $process = Start-Process -FilePath $QaNodeExecutable -ArgumentList (ConvertTo-QaArgumentString $Arguments) -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runRoot ($Role + '-stdout.txt')) -RedirectStandardError (Join-Path $runRoot ($Role + '-stderr.txt')) -PassThru
    $manifest.processes += @{ role = $Role; pid = $process.Id; startTimeUtc = $process.StartTime.ToUniversalTime().ToString('o'); arguments = $Arguments; commandLine = $null }
    Save-QaManifest
    $metadata = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
    if (-not $metadata -or -not $metadata.CommandLine -or [IO.Path]::GetFullPath($metadata.ExecutablePath) -ne $QaNodeExecutable) { throw 'No se pudo registrar identidad exacta del proceso; revisar manifest antes de limpiar.' }
    $manifest.processes[-1].commandLine = $metadata.CommandLine
    Save-QaManifest
}
try {
    Start-QaNode 'api' @($apiMain) $QaBackendRoot
    $frontendArguments = @($vite)
    if (-not $DevelopmentFrontend) { $frontendArguments += 'preview' }
    $frontendArguments += @('--host', '127.0.0.1', '--port', '4177', '--strictPort')
    Start-QaNode 'frontend' $frontendArguments $QaFrontendRoot
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $apiResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3047/api/health' -TimeoutSec 2
            $frontendResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4177' -TimeoutSec 2
            if ($apiResponse.StatusCode -eq 200 -and $frontendResponse.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'API/frontend no respondieron; revisar logs de esta sesión.' }
    $manifest.status = 'ready_http_200'
    Save-QaManifest
    Write-Output ('QA lista. Manifest NUEVO: ' + $manifestPath)
} catch {
    $manifest.status = 'startup_failed'
    Save-QaManifest
    Write-Output ('Arranque falló. Manifest propio para inspección/cierre: ' + $manifestPath)
    throw
}
