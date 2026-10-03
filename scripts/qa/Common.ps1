$ErrorActionPreference = 'Stop'

function Resolve-QaFile([string]$Path) {
    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Falta archivo requerido: $Path" }
    return [IO.Path]::GetFullPath($resolved)
}

function Initialize-QaPaths([string]$RepoRoot, [string]$NodeExecutable, [string]$NpmCliPath) {
    $script:QaRepoRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoRoot).ProviderPath).TrimEnd([char]92)
    $script:QaBackendRoot = Join-Path $script:QaRepoRoot 'backend'
    $script:QaFrontendRoot = Join-Path $script:QaRepoRoot 'frontend'
    foreach ($required in @('backend\package.json', 'frontend\package.json', 'AGENTS.md')) {
        if (-not (Test-Path -LiteralPath (Join-Path $script:QaRepoRoot $required) -PathType Leaf)) { throw 'RepoRoot debe apuntar al clon TOP que contiene backend y frontend.' }
    }
    foreach ($candidate in @('.env', 'backend\.env', 'backend\prisma\.env', 'frontend\.env', 'frontend\.env.local', 'frontend\.env.development', 'frontend\.env.development.local', 'frontend\.env.production', 'frontend\.env.production.local')) {
        if (Test-Path -LiteralPath (Join-Path $script:QaRepoRoot $candidate)) { throw 'Usar un clon dedicado sin archivos env; no se leen ni eliminan.' }
    }
    $script:QaNodeExecutable = Resolve-QaFile $NodeExecutable
    $script:QaNpmCli = Resolve-QaFile $NpmCliPath
    $env:Path = "$(Split-Path -Parent $script:QaNodeExecutable);$env:Path"
    $env:TOP_QA_REPO_ROOT = $script:QaRepoRoot
}

function Set-QaSyntheticEnvironment([string]$Mode = 'test') {
    Get-ChildItem Env: | Where-Object { $_.Name -match '^(NODE_ENV|DATABASE_URL|PORT|CORS_ORIGIN|APP_PUBLIC_URL|JWT_.*|PASSWORD_RESET_.*|REFRESH_TOKEN_.*|EMAIL_.*|SMTP_.*|S3_.*|VITE_.*)$' } | ForEach-Object { Remove-Item -LiteralPath ('Env:\' + $_.Name) }
    $env:NODE_ENV = $Mode
    $env:DATABASE_URL = 'postgresql://top_night_test:top-night-integration-synthetic-20261001@127.0.0.1:55473/top_test?schema=public'
    $env:JWT_ACCESS_SECRET = 'top-night-contract-jwt-synthetic-20261001'
    $env:PASSWORD_RESET_OTP_SECRET = 'top-night-contract-otp-independent-synthetic-20261001'
    $env:EMAIL_DELIVERY_MODE = 'console'
    $env:PORT = '3047'
    $env:APP_PUBLIC_URL = 'http://127.0.0.1:4177'
    $env:CORS_ORIGIN = 'http://127.0.0.1:4177,http://localhost:4177'
    $env:VITE_API_URL = 'http://127.0.0.1:3047/api'
}

function Invoke-QaNode([string[]]$Arguments) {
    & $script:QaNodeExecutable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Comando Node falló con exit $LASTEXITCODE." }
}

function Assert-QaGitClean {
    $dirty = @(& git -C $script:QaRepoRoot status --porcelain -- backend frontend)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Git; no cambiar configuración global para omitir el fallo.' }
    if ($dirty.Count -ne 0) { throw 'backend/frontend tienen cambios; usar un clon limpio del corte elegido.' }
}

function ConvertTo-QaArgumentString([string[]]$Arguments) {
    # Los argumentos de este paquete son paths Windows y flags sin comillas internas.
    foreach ($argument in $Arguments) { if ($argument.Contains('"')) { throw 'Argumento con comillas no admitido.' } }
    return (($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' ')
}

function Assert-QaPostgresOwnership([string]$PgContainerId, [string]$PgName, [string]$PgRunId) {
    if ($PgContainerId -notmatch '^[0-9a-f]{64}$' -or $PgRunId -notmatch '^[0-9a-f]{32}$' -or $PgName -ne ('top-portable-qa-pg-' + $PgRunId)) { throw 'Se requiere ID completo y nombre/runId propios de la nueva sesión PG.' }
    $records = @(& docker inspect $PgContainerId | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or $records.Count -ne 1) { throw 'No se pudo verificar PG propio; no ejecutar gates/seed/arranque.' }
    $pg = $records[0]
    $bindings = @($pg.HostConfig.PortBindings.'5432/tcp')
    if ($pg.Id -ne $PgContainerId -or $pg.Name -ne ('/' + $PgName) -or $pg.Config.Labels.'top.portable.qa.run' -ne $PgRunId -or $pg.Config.Image -ne 'postgres:16-alpine' -or -not $pg.HostConfig.AutoRemove -or $pg.HostConfig.Tmpfs.'/var/lib/postgresql/data' -ne 'rw,size=512m' -or @($pg.Mounts).Count -ne 0 -or $bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne '55473' -or -not $pg.State.Running -or $pg.State.Health.Status -ne 'healthy') { throw 'Ownership/topología/health de PG no coinciden; no ejecutar.' }
    $identity = (& docker exec $PgContainerId psql -U top_night_test -d top_test -tAc "SELECT current_database() || '|' || current_user;" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $identity -ne 'top_test|top_night_test') { throw 'Identidad SQL inesperada; no ejecutar.' }
    $otherClients = (& docker exec $PgContainerId psql -U top_night_test -d top_test -tAc "SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid();" | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $otherClients -ne '0') { throw 'Hay otros clientes PG o no se pudieron comprobar; no ejecutar.' }
    $env:TOP_QA_PG_CONTAINER_NAME = $PgName
}
