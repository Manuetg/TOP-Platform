param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [Parameter(Mandatory = $true)][string]$NpmCliPath
)
. (Join-Path $PSScriptRoot 'Common.ps1')
Initialize-QaPaths $RepoRoot $NodeExecutable $NpmCliPath
Set-QaSyntheticEnvironment 'test'
Write-Output 'Entorno sintético QA: test, top_test/top_night_test en 127.0.0.1:55473; correo console y memoria.'
