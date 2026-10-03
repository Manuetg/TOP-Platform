param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [Parameter(Mandatory = $true)][string]$NpmCliPath,
    [Parameter(Mandatory = $true)][string]$PgContainerId,
    [Parameter(Mandatory = $true)][string]$PgName,
    [Parameter(Mandatory = $true)][string]$PgRunId,
    [switch]$GatesTerminados
)
if (-not $GatesTerminados) { throw 'Terminar gates antes de sembrar fixtures; indicar -GatesTerminados.' }
. (Join-Path $PSScriptRoot 'Common.ps1')
Initialize-QaPaths $RepoRoot $NodeExecutable $NpmCliPath
Set-QaSyntheticEnvironment 'test'
Assert-QaGitClean
Assert-QaPostgresOwnership $PgContainerId $PgName $PgRunId
Invoke-QaNode -Arguments @((Join-Path $PSScriptRoot 'Check-QADatabase.cjs'))
Invoke-QaNode -Arguments @((Join-Path $PSScriptRoot 'Seed-QAFixtures.cjs'), '--gates-terminados')
