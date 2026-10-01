param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [Parameter(Mandatory = $true)][string]$NpmCliPath,
    [Parameter(Mandatory = $true)][string]$PgContainerId,
    [Parameter(Mandatory = $true)][string]$PgName,
    [Parameter(Mandatory = $true)][string]$PgRunId,
    [switch]$EjecutarGates
)
if (-not $EjecutarGates) { throw 'Indicar -EjecutarGates solo al ejecutar la reproducción autorizada.' }
. (Join-Path $PSScriptRoot 'Common.ps1')
Initialize-QaPaths $RepoRoot $NodeExecutable $NpmCliPath
Set-QaSyntheticEnvironment 'test'
Assert-QaGitClean
Assert-QaPostgresOwnership $PgContainerId $PgName $PgRunId
$runRoot = Join-Path $PSScriptRoot ('runs\gates-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'))
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$prisma = Resolve-QaFile (Join-Path $QaBackendRoot 'node_modules\prisma\build\index.js')
$headBefore = (& git -C $QaRepoRoot rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se pudo capturar HEAD.' }
$treeBefore = (& git -C $QaRepoRoot rev-parse 'HEAD:backend' | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'No se pudo capturar árbol backend.' }
$report = [ordered]@{ startedAt = (Get-Date).ToUniversalTime().ToString('o'); headStart = $headBefore; backendTreeStart = $treeBefore; nodeVersion = (& $QaNodeExecutable --version | Out-String).Trim(); conclusion = 'not_completed'; gates = @() }
$commands = @(
    @{ name = 'prisma-generate'; args = @($prisma, 'generate') },
    @{ name = 'database-identity'; args = @((Join-Path $PSScriptRoot 'Check-QADatabase.cjs')) },
    @{ name = 'prisma-validate'; args = @($prisma, 'validate') },
    @{ name = 'prisma-migrate-deploy'; args = @($prisma, 'migrate', 'deploy') },
    @{ name = 'build'; args = @($QaNpmCli, 'run', 'build') },
    @{ name = 'lint'; args = @($QaNpmCli, 'run', 'lint') },
    @{ name = 'unit'; args = @($QaNpmCli, 'run', 'test:unit', '--', '--runInBand') },
    @{ name = 'integration'; args = @($QaNpmCli, 'run', 'test:integration') },
    @{ name = 'e2e'; args = @($QaNpmCli, 'run', 'test:e2e', '--', '--runInBand') },
    @{ name = 'acceptance'; args = @($QaNpmCli, 'run', 'test:acceptance') },
    @{ name = 'coverage'; args = @($QaNpmCli, 'run', 'test:coverage') },
    @{ name = 'architecture'; args = @($QaNpmCli, 'run', 'architecture:check') }
)
Push-Location -LiteralPath $QaBackendRoot
try {
    foreach ($command in $commands) {
        Write-Output ('Gate: ' + $command.name)
        $arguments = [string[]]$command.args
        & $QaNodeExecutable @arguments 2>&1 | Tee-Object -FilePath (Join-Path $runRoot ($command.name + '.txt'))
        $exitCode = $LASTEXITCODE
        $report.gates += @{ name = $command.name; exitCode = $exitCode; arguments = $arguments }
        $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'results.json') -Encoding UTF8
        if ($exitCode -ne 0) { throw ('Gate falló: ' + $command.name) }
    }
    Assert-QaGitClean
    $report.headEnd = (& git -C $QaRepoRoot rev-parse HEAD | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo capturar HEAD final.' }
    $report.backendTreeEnd = (& git -C $QaRepoRoot rev-parse 'HEAD:backend' | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $report.headEnd -ne $headBefore -or $report.backendTreeEnd -ne $treeBefore) { throw 'Cambió la fuente; requiere revalidación.' }
    $report.conclusion = 'all_listed_gates_passed_for_recorded_backend_tree'
} catch {
    $report.conclusion = 'failed_or_incomplete'
    $report.error = $_.Exception.Message
    throw
} finally {
    $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'results.json') -Encoding UTF8
    Pop-Location
    Write-Output ('Informe: ' + (Join-Path $runRoot 'results.json'))
}
