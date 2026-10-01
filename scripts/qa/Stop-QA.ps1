param([Parameter(Mandatory = $true)][string]$ManifestPath)
$ErrorActionPreference = 'Stop'
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runs')).TrimEnd([char]92) + [IO.Path]::DirectorySeparatorChar
$resolvedManifest = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ManifestPath).ProviderPath)
if (-not $resolvedManifest.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedManifest) -ne 'processes.json') { throw 'Manifest fuera de runs del paquete; no detener procesos.' }
$jsonOptions = @{}
if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { $jsonOptions.DateKind = 'String' }
$manifest = Get-Content -LiteralPath $resolvedManifest -Raw -Encoding UTF8 | ConvertFrom-Json @jsonOptions
if ($manifest.owner -ne 'top-portable-qa-v1' -or [IO.Path]::GetFullPath($manifest.packageRoot).TrimEnd([char]92) -ne [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([char]92)) { throw 'Manifest de otro paquete/owner; no detener.' }
$nodeExecutable = [IO.Path]::GetFullPath($manifest.nodeExecutable)
$repoRoot = [IO.Path]::GetFullPath($manifest.repoRoot).TrimEnd([char]92)
if ($manifest.frontendMode -notin @('dev', 'preview') -or $manifest.bootstrap -ne 'backend/dist/src/main.js' -or $manifest.nodeEnv -ne 'development') { throw 'Manifest no describe el bootstrap portable autorizado.' }
$verifiedProcesses = @()
foreach ($owned in $manifest.processes) {
    if ($owned.role -notin @('api', 'frontend') -or -not $owned.commandLine -or @($owned.arguments).Count -eq 0) { throw 'Registro de proceso incompleto; inspeccionar manualmente sin omitir guardas.' }
    [string[]]$expectedArguments = if ($owned.role -eq 'api') { @(Join-Path $repoRoot 'backend\dist\src\main.js') } else {
        $frontendArguments = @(Join-Path $repoRoot 'frontend\node_modules\vite\bin\vite.js')
        if ($manifest.frontendMode -eq 'preview') { $frontendArguments += 'preview' }
        $frontendArguments += @('--host', '127.0.0.1', '--port', '4177', '--strictPort')
        $frontendArguments
    }
    if (@($owned.arguments).Count -ne @($expectedArguments).Count) { throw 'Cantidad de argumentos fuera del scope portable.' }
    for ($index = 0; $index -lt @($expectedArguments).Count; $index++) {
        if ([string]$owned.arguments[$index] -ne [string]$expectedArguments[$index]) { throw 'Argumentos no corresponden al rol/RepoRoot portable; no detener.' }
    }
    $processId = [int]$owned.pid
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    $expectedStart = if ($owned.startTimeUtc -is [DateTime]) { $owned.startTimeUtc.ToUniversalTime().Ticks } else { ([DateTimeOffset]::Parse([string]$owned.startTimeUtc)).UtcDateTime.Ticks }
    if ($process.StartTime.ToUniversalTime().Ticks -ne $expectedStart) { throw 'PID reutilizado; no detener.' }
    $metadata = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    if (-not $metadata.ExecutablePath -or [IO.Path]::GetFullPath($metadata.ExecutablePath) -ne $nodeExecutable -or $metadata.CommandLine -cne $owned.commandLine) { throw 'Executable/commandline no coinciden; no detener.' }
    foreach ($argument in $owned.arguments) {
        if ($metadata.CommandLine.IndexOf([string]$argument, [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'Argumentos no coinciden; no detener.' }
    }
    $verifiedProcesses += @{ pid = $processId; startTicks = $expectedStart }
}
# Todas las guardas pasan antes de realizar la primera detención.
foreach ($verified in $verifiedProcesses) {
    $processId = $verified.pid
    $currentProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $currentProcess) { continue }
    if ($currentProcess.StartTime.ToUniversalTime().Ticks -ne $verified.startTicks) { throw 'PID reutilizado antes del cierre; no detener.' }
    Stop-Process -Id $processId -Force -ErrorAction Stop
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) { throw 'Proceso propio continúa activo; inspeccionar sin matar por nombre.' }
}
$manifest.status = 'stopped_verified_own_processes'
$manifest | Add-Member -NotePropertyName stoppedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o') -Force
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedManifest -Encoding UTF8
Write-Output 'Procesos API/frontend propios verificados cerrados. PostgreSQL no fue detenido por este script.'
