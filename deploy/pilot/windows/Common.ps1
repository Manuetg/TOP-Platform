$ErrorActionPreference = 'Stop'

# No imprime la configuración resuelta, env, stderr de Docker ni logs de servicios.
$script:PilotEnvKeys = @('PILOT_PROJECT', 'PILOT_SOURCE_COMMIT', 'LAN_IP', 'API_IMAGE', 'FRONTEND_IMAGE', 'POSTGRES_IMAGE', 'MINIO_IMAGE', 'HELPER_IMAGE', 'POSTGRES_PASSWORD', 'DATABASE_URL', 'MIGRATION_DATABASE_URL', 'JWT_ACCESS_SECRET', 'PASSWORD_RESET_OTP_SECRET', 'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET')
$script:PilotImageKeys = @('API_IMAGE', 'FRONTEND_IMAGE', 'POSTGRES_IMAGE', 'MINIO_IMAGE', 'HELPER_IMAGE')

function Assert-PilotProject([string]$Project, [switch]$Restore) {
    $pattern = '^top-pilot-[a-z0-9][a-z0-9-]{0,39}$'
    if ($Restore) { $pattern = '^top-pilot-restore-[a-z0-9][a-z0-9-]{0,31}$' }
    if ($Project -cnotmatch $pattern -or (-not $Restore -and $Project.StartsWith('top-pilot-restore-'))) {
        throw 'Nombre de proyecto inválido para este procedimiento.'
    }
}

function Test-PilotPrivateIPv4([string]$Address) {
    if ($Address -cnotmatch '^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$') { return $false }
    $octets = @($Address.Split('.') | ForEach-Object { [int]$_ })
    if (@($octets | Where-Object { $_ -gt 255 }).Count -ne 0) { return $false }
    return ($octets[0] -eq 10 -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or ($octets[0] -eq 192 -and $octets[1] -eq 168))
}

function Test-PilotCredentialPlaceholder([string]$Value) {
    return ($Value -match '(?i)(pendiente|development|dev[-_]?only|example|ejemplo|placeholder|change[-_]?me|cambiar|replace[-_]?me|your[-_]|ci[-_]?only|test[-_]?secret|not[-_]?for[-_]?production|synthetic|<|>)' -or $Value -match '^(?i:topminio|topminiosecret|minioadmin|postgres|password|admin|top)$')
}

function ConvertFrom-PilotEnvText([string]$Text) {
    $values = @{}
    foreach ($line in ($Text -split '\r?\n')) {
        if ($line.Trim().Length -eq 0 -or $line.TrimStart().StartsWith('#')) { continue }
        if ($line -cnotmatch '^([A-Z][A-Z0-9_]*)=(\S+)$') { throw 'El archivo env debe usar KEY=valor sin comillas, espacios ni líneas múltiples.' }
        $key = $Matches[1]
        $value = $Matches[2]
        if ($script:PilotEnvKeys -cnotcontains $key -or $values.ContainsKey($key)) { throw 'Variable desconocida o duplicada en el archivo env.' }
        if ($value -cmatch '[\x00-\x20\x7f-\uffff\$#''"\\`]') { throw 'El archivo env contiene caracteres o interpolación no admitidos.' }
        $values[$key] = $value
    }
    foreach ($key in $script:PilotEnvKeys) { if (-not $values.ContainsKey($key)) { throw 'El archivo env está incompleto.' } }
    Assert-PilotProject $values.PILOT_PROJECT
    if ($values.PILOT_SOURCE_COMMIT -cnotmatch '^[0-9a-f]{40}$') { throw 'Falta el commit completo del candidato.' }
    if (-not (Test-PilotPrivateIPv4 $values.LAN_IP)) { throw 'LAN_IP debe ser una IPv4 RFC1918 canónica.' }
    foreach ($key in $script:PilotImageKeys) {
        if ($values[$key] -cnotmatch '^(sha256:[0-9a-f]{64}|[a-z0-9][a-z0-9./:_-]*@sha256:[0-9a-f]{64})$') {
            throw 'Las cinco imágenes deben usar digest SHA256 o ID local inmutable; no tags.'
        }
    }
    if ($values.S3_BUCKET.Length -gt 63 -or $values.S3_BUCKET -cnotmatch '^top-pilot-[a-z0-9][a-z0-9-]*$' -or $values.S3_BUCKET.EndsWith('-')) { throw 'El bucket debe usar prefijo top-pilot-, letras minúsculas/dígitos/guiones y máximo 63 caracteres, sin guion final.' }
    $minimum = @{ POSTGRES_PASSWORD = 16; JWT_ACCESS_SECRET = 32; PASSWORD_RESET_OTP_SECRET = 32; MINIO_ROOT_USER = 3; MINIO_ROOT_PASSWORD = 16; S3_ACCESS_KEY = 8; S3_SECRET_KEY = 32 }
    foreach ($key in $minimum.Keys) {
        if ([Text.Encoding]::UTF8.GetByteCount($values[$key]) -lt $minimum[$key] -or (Test-PilotCredentialPlaceholder $values[$key])) {
            throw 'Faltan credenciales propias completas del operador; no se generan ni se muestran.'
        }
    }
    $expectedUrl = 'postgresql://top_pilot:' + [Uri]::EscapeDataString($values.POSTGRES_PASSWORD) + '@postgres:5432/top_pilot'
    if ($values.MIGRATION_DATABASE_URL -cne $expectedUrl -and $values.MIGRATION_DATABASE_URL -cne ($expectedUrl + '?schema=public')) { throw 'MIGRATION_DATABASE_URL no coincide con propietario/base privada y su credencial de mantenimiento.' }
    if ($values.DATABASE_URL -cnotmatch '^postgresql://top_pilot_app:([^/@?#\\]+)@postgres:5432/top_pilot(?:\?schema=public)?$') { throw 'DATABASE_URL debe usar exclusivamente top_pilot_app en postgres:5432/top_pilot.' }
    $appPassword = [Uri]::UnescapeDataString($Matches[1])
    $expectedAppUrl = 'postgresql://top_pilot_app:' + [Uri]::EscapeDataString($appPassword) + '@postgres:5432/top_pilot'
    if (($values.DATABASE_URL -cne $expectedAppUrl -and $values.DATABASE_URL -cne ($expectedAppUrl + '?schema=public')) -or [Text.Encoding]::UTF8.GetByteCount($appPassword) -lt 32 -or (Test-PilotCredentialPlaceholder $appPassword)) { throw 'La contraseña API debe ser propia, >=32 bytes y con escape URI canónico; no ejemplos ni aliases.' }
    $independent = @($values.POSTGRES_PASSWORD, $appPassword, $values.JWT_ACCESS_SECRET, $values.PASSWORD_RESET_OTP_SECRET, $values.MINIO_ROOT_PASSWORD, $values.S3_SECRET_KEY)
    if (@($independent | Select-Object -Unique).Count -ne $independent.Count -or $values.MINIO_ROOT_USER -ceq $values.S3_ACCESS_KEY) { throw 'Las credenciales de aplicación y administración y los secretos deben ser independientes.' }
    $appPassword = $null
    return $values
}

function Assert-PilotNoReparse([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    while ($null -ne $item) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'No se admiten junctions, enlaces ni reparse points para archivos protegidos.' }
        $parent = Split-Path -Parent $item.FullName
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $item.FullName) { break }
        $item = Get-Item -LiteralPath $parent -Force -ErrorAction Stop
    }
}

function Assert-PilotOutsideGit([string]$Path, [string]$PackageRoot) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.Equals($PackageRoot, [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($PackageRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'El env y los respaldos deben estar fuera del paquete y de Git.' }
    $directory = $full
    if (Test-Path -LiteralPath $full -PathType Leaf) { $directory = Split-Path -Parent $full }
    while (-not [string]::IsNullOrEmpty($directory)) {
        if (Test-Path -LiteralPath (Join-Path $directory '.git')) { throw 'El env y los respaldos no pueden guardarse dentro de un repositorio Git.' }
        $parent = Split-Path -Parent $directory
        if ($parent -eq $directory) { break }
        $directory = $parent
    }
}

function Assert-PilotRestrictedAcl([string]$Path) {
    $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { continue }
        try { $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { throw 'No se pudo comprobar un principal de ACL; revisar localmente.' }
        $sensitiveRights = [Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles
        if ($allowed -notcontains $sid -and ($rule.FileSystemRights -band $sensitiveRights) -ne 0) { throw 'ACL demasiado amplia: limitar acceso al operador, SYSTEM y Administrators antes de continuar.' }
    }
}

function Resolve-PilotProtectedPath([string]$Path, [string]$PackageRoot, [switch]$Directory) {
    if (-not [IO.Path]::IsPathRooted($Path) -or $Path.StartsWith('\\')) { throw 'Usar una ruta absoluta local protegida; no una ruta UNC.' }
    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
    $kind = 'Leaf'
    if ($Directory) { $kind = 'Container' }
    if (-not (Test-Path -LiteralPath $resolved -PathType $kind)) { throw 'No existe el archivo o carpeta protegida requerida.' }
    Assert-PilotNoReparse $resolved
    Assert-PilotOutsideGit $resolved $PackageRoot
    Assert-PilotRestrictedAcl $resolved
    if (-not $Directory) { Assert-PilotRestrictedAcl (Split-Path -Parent $resolved) }
    return [IO.Path]::GetFullPath($resolved)
}

function ConvertTo-PilotProcessArguments([string[]]$Arguments) {
    # Reglas CommandLineToArgvW; ProcessStartInfo no usa cmd.exe ni otro shell.
    $quoted = foreach ($argument in $Arguments) {
        if ($argument.Contains([char]0) -or $argument.Contains("`r") -or $argument.Contains("`n")) { throw 'Argumento nativo inválido.' }
        '"' + [regex]::Replace([regex]::Replace($argument, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
    }
    return ($quoted -join ' ')
}

function Invoke-PilotDocker([string[]]$Arguments, [string]$InputText, [string]$Action = 'operación Docker', [switch]$AllowFailure, [hashtable]$Overrides, [int]$TimeoutSeconds = 0) {
    $nativeArgs = @()
    if ($script:PilotDockerContext) { $nativeArgs += @('--context', $script:PilotDockerContext) }
    $nativeArgs += $Arguments
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $script:PilotDockerExecutable
    $info.Arguments = ConvertTo-PilotProcessArguments $nativeArgs
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = $true
    foreach ($key in @($info.EnvironmentVariables.Keys)) {
        if ($script:PilotEnvKeys -contains $key -or $key -match '^(COMPOSE_|DOCKER_)') { $info.EnvironmentVariables.Remove($key) }
    }
    if ($Overrides) { foreach ($key in $Overrides.Keys) { $info.EnvironmentVariables[$key] = [string]$Overrides[$key] } }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if ($InputText) { $process.StandardInput.Write($InputText) }
        $process.StandardInput.Close()
        if ($TimeoutSeconds -gt 0) {
            if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
                try { $process.Kill() } catch { }
                throw ($Action + ' excedió el plazo; salida sensible omitida. No habilitar el gateway.')
            }
        } else { $process.WaitForExit() }
        $output = $stdout.GetAwaiter().GetResult()
        # Consumir y descartar stderr: puede contener valores del entorno o datos.
        [void]$stderr.GetAwaiter().GetResult()
        $code = $process.ExitCode
        if ($code -ne 0 -and -not $AllowFailure) { throw ($Action + ' falló. Código ' + $code + '; salida sensible omitida. Revisar localmente sin compartir logs.') }
        return [pscustomobject]@{ ExitCode = $code; Output = $output }
    } finally { $process.Dispose() }
}

function Invoke-PilotCompose([string[]]$Arguments, [string]$Action = 'Compose', [switch]$AllowFailure) {
    $argsForDocker = @('compose', '--project-name', $script:PilotProject, '--file', $script:PilotComposePath, '--env-file', $script:PilotEnvPath) + $Arguments
    return Invoke-PilotDocker -Arguments $argsForDocker -Action $Action -AllowFailure:$AllowFailure -Overrides @{ PILOT_PROJECT = $script:PilotProject }
}

function Assert-PilotManifest([switch]$Approved) {
    try { $manifest = Get-Content -LiteralPath (Join-Path $script:PilotRoot 'release-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json } catch { throw 'Manifiesto de release ausente o inválido.' }
    if ($manifest.schemaVersion -ne 1 -or $manifest.sourceCommit -cne $script:PilotEnv.PILOT_SOURCE_COMMIT) { throw 'El manifiesto no identifica el mismo commit del archivo env.' }
    foreach ($key in $script:PilotImageKeys) { if ($manifest.images.$key -cne $script:PilotEnv[$key]) { throw 'Las imágenes del env y del manifiesto no coinciden.' } }
    $required = @('compose.pilot.yml', 'compose.restore.yml', 'gateway.conf.template', 'sql/provision-app-role.sql', 'windows/Provision-AppRole.ps1', 'windows/Common.ps1', 'windows/Validate.ps1', 'windows/PrepareData.ps1', 'windows/Start.ps1', 'windows/Stop.ps1', 'windows/Migrate.ps1', 'windows/Backup.ps1', 'windows/Restore.ps1', 'windows/InspectFirewall.ps1')
    foreach ($relative in $required) {
        $hash = $manifest.files.$relative
        if ($hash -cnotmatch '^[0-9a-fA-F]{64}$') { throw 'El manifiesto está incompleto: faltan hashes finales de los archivos del paquete.' }
        $file = Join-Path $script:PilotRoot $relative
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $hash) { throw 'Un archivo del paquete no coincide con su hash aprobado; no ejecutar.' }
    }
    if ($Approved -and $manifest.releaseApproved -ne $true) { throw 'El operador debe revisar y aprobar el manifiesto de release antes de esta operación.' }
    $script:PilotManifest = $manifest
}

function Assert-PilotLan {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -ceq $script:PilotEnv.LAN_IP -and $_.AddressState -eq 'Preferred' })
    if ($addresses.Count -ne 1) { throw 'LAN_IP no identifica una IPv4 Preferred propia y única del servidor.' }
    $adapter = Get-NetAdapter -InterfaceIndex $addresses[0].InterfaceIndex -ErrorAction Stop
    $profile = @(Get-NetConnectionProfile -InterfaceIndex $addresses[0].InterfaceIndex -ErrorAction Stop)
    if ($adapter.Status -ne 'Up' -or $adapter.PhysicalMediaType -notin @('Native 802.11', 'WirelessLan', 'Wireless LAN', 9) -or $profile.Count -ne 1 -or $profile[0].NetworkCategory -ne 'Private') {
        throw 'El piloto exige interfaz Wi-Fi física activa en perfil Private; revisar sin modificar red ni firewall.'
    }
    $script:PilotInterfaceIndex = $addresses[0].InterfaceIndex
    $script:PilotInterfaceAlias = $adapter.Name
}

function Initialize-Pilot([string]$EnvPath, [switch]$Restore, [string]$Project) {
    $script:PilotRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $script:PilotEnvPath = Resolve-PilotProtectedPath $EnvPath $script:PilotRoot
    $script:PilotEnv = ConvertFrom-PilotEnvText ([IO.File]::ReadAllText($script:PilotEnvPath, [Text.Encoding]::UTF8))
    $script:PilotProject = $script:PilotEnv.PILOT_PROJECT
    $script:PilotScope = 'lan-pilot'
    $script:PilotComposePath = Join-Path $script:PilotRoot 'compose.pilot.yml'
    if ($Restore) {
        Assert-PilotProject $Project -Restore
        $script:PilotProject = $Project
        $script:PilotScope = 'restore'
        $script:PilotComposePath = Join-Path $script:PilotRoot 'compose.restore.yml'
    }
    Assert-PilotManifest
    $script:PilotDockerExecutable = (Get-Command docker.exe -ErrorAction Stop).Source
    $script:PilotDockerContext = $null
    $script:PilotDockerContext = (Invoke-PilotDocker -Arguments @('context', 'show') -Action 'lectura de contexto Docker').Output.Trim()
    if ($script:PilotDockerContext -notin @('desktop-linux', 'default')) { throw 'Usar exclusivamente el contexto local Linux de Docker Desktop.' }
    $endpoint = (Invoke-PilotDocker -Arguments @('context', 'inspect', $script:PilotDockerContext, '--format', '{{.Endpoints.docker.Host}}') -Action 'lectura del endpoint Docker').Output.Trim()
    if ($endpoint -cnotmatch '^npipe:////\./pipe/(dockerDesktopLinuxEngine|docker_engine)$') { throw 'El endpoint Docker no es un named pipe local autorizado de Docker Desktop.' }
    $kind = (Invoke-PilotDocker -Arguments @('info', '--format', '{{.OSType}}|{{.OperatingSystem}}') -Action 'lectura de Docker Desktop').Output.Trim()
    if ($kind -notmatch '^linux\|Docker Desktop') { throw 'Docker Desktop local debe estar operativo en modo contenedores Linux.' }
    [void](Invoke-PilotDocker -Arguments @('compose', 'version', '--short') -Action 'lectura versión Compose')
    [void](Invoke-PilotCompose -Arguments @('--profile', '*', 'config', '--quiet') -Action 'validación silenciosa Compose')
    Assert-PilotComposePolicy -Restore:$Restore
    $script:PilotImageIds = @{}
    foreach ($key in $script:PilotImageKeys) {
        $id = (Invoke-PilotDocker -Arguments @('image', 'inspect', $script:PilotEnv[$key], '--format', '{{.Id}}') -Action 'comprobación de imagen local aprobada').Output.Trim()
        if ($id -cnotmatch '^sha256:[0-9a-f]{64}$') { throw 'Una imagen local no tiene identidad inmutable válida.' }
        $script:PilotImageIds[$key] = $id
    }
}

function Assert-PilotComposePolicy([switch]$Restore) {
    # JSON resuelto únicamente en memoria. No devolver ni escribir el modelo ni sus env.
    try { $config = (Invoke-PilotCompose -Arguments @('--profile', '*', 'config', '--format', 'json') -Action 'inspección privada de la política Compose').Output | ConvertFrom-Json } catch { throw 'No se pudo validar la política efectiva de Compose; detalles omitidos.' }
    $expected = @('api', 'gateway', 'minio', 'postgres', 'migrate')
    if ($Restore) { $expected = @('minio', 'postgres') }
    $names = @($config.services.PSObject.Properties.Name)
    if (@(Compare-Object ($expected | Sort-Object) ($names | Sort-Object)).Count -ne 0) { throw 'Inventario de servicios inesperado.' }
    $imageKeys = @{ api = 'API_IMAGE'; migrate = 'API_IMAGE'; gateway = 'FRONTEND_IMAGE'; postgres = 'POSTGRES_IMAGE'; minio = 'MINIO_IMAGE' }
    foreach ($name in $names) {
        $service = $config.services.$name
        if ($service.image -cne $script:PilotEnv[$imageKeys[$name]] -or $service.labels.'com.top.pilot.scope' -cne $script:PilotScope) { throw 'Imagen o etiqueta de aislamiento de servicio inválida.' }
        if ($service.build -or $service.privileged -or $service.cap_add -or $service.network_mode -or $service.pid -or $service.ipc -or $service.container_name -or $service.devices) { throw 'Compose declara privilegios, builds o aislamiento no permitidos.' }
        $ports = @($service.ports | Where-Object { $null -ne $_ })
        if ($name -eq 'gateway' -and -not $Restore) {
            if ($ports.Count -ne 1 -or $ports[0].host_ip -cne $script:PilotEnv.LAN_IP -or [string]$ports[0].published -cne '3001' -or $ports[0].target -ne 80 -or $ports[0].protocol -ne 'tcp') { throw 'El único puerto debe ser LAN_IP:3001/TCP hacia gateway:80.' }
        } elseif ($ports.Count -ne 0) { throw 'API, PostgreSQL, MinIO, consola y restore deben permanecer sin puertos host.' }
        foreach ($mount in @($service.volumes | Where-Object { $null -ne $_ })) {
            if ($name -in @('postgres', 'minio')) {
                $volume = 'postgres_data'; $target = '/var/lib/postgresql/data'
                if ($name -eq 'minio') { $volume = 'minio_data'; $target = '/data' }
                if ($mount.type -ne 'volume' -or $mount.source -cne $volume -or $mount.target -cne $target) { throw 'Montaje persistente fuera del volumen exclusivo esperado.' }
            } elseif ($name -eq 'gateway') {
                $approvedSource = Join-Path $script:PilotRoot 'gateway.conf.template'
                if ($mount.type -ne 'bind' -or [IO.Path]::GetFullPath($mount.source) -ine $approvedSource -or $mount.target -cne '/etc/nginx/templates/default.conf.template' -or -not $mount.read_only) { throw 'El único bind autorizado es el template read-only del gateway.' }
            } else { throw 'No se admiten montajes adicionales en API o migrador.' }
        }
        if ($name -in @('postgres', 'minio') -and @($service.volumes).Count -ne 1) { throw 'Cada servicio de datos requiere exactamente su volumen persistente propio.' }
    }
    $volumeNames = @($config.volumes.PSObject.Properties.Name)
    if (@(Compare-Object @('minio_data', 'postgres_data') ($volumeNames | Sort-Object)).Count -ne 0) { throw 'Inventario de volúmenes inesperado.' }
    foreach ($name in $volumeNames) {
        if ($config.volumes.$name.name -cne ($script:PilotProject + '_' + $name) -or $config.volumes.$name.external -or $config.volumes.$name.labels.'com.top.pilot.scope' -cne $script:PilotScope) { throw 'Los volúmenes deben pertenecer exclusivamente al proyecto.' }
    }
    $networks = @('app', 'db', 'ingress')
    if ($Restore) { $networks = @('isolated') }
    if (@(Compare-Object ($networks | Sort-Object) (@($config.networks.PSObject.Properties.Name) | Sort-Object)).Count -ne 0) { throw 'Inventario de redes inesperado.' }
    foreach ($name in $networks) {
        $network = $config.networks.$name
        if ($network.external -or $network.name -cne ($script:PilotProject + '_' + $name) -or $network.labels.'com.top.pilot.scope' -cne $script:PilotScope -or ($name -ne 'ingress' -and -not $network.internal)) { throw 'Las redes deben ser propias y privadas salvo ingreso del gateway.' }
    }
    foreach ($name in $names) {
        $assigned = @($config.services.$name.networks.PSObject.Properties.Name | Sort-Object)
        $allowed = @('app'); if ($name -in @('postgres', 'migrate')) { $allowed = @('db') }; if ($name -eq 'api') { $allowed = @('app', 'db') }; if ($name -eq 'gateway') { $allowed = @('app', 'ingress') }; if ($Restore) { $allowed = @('isolated') }
        if (@(Compare-Object ($allowed | Sort-Object) $assigned).Count -ne 0) { throw 'Un servicio está conectado a una red no autorizada.' }
    }
    if (-not $Restore) {
        $api = $config.services.api.environment
        $origin = 'http://' + $script:PilotEnv.LAN_IP + ':3001'
        if ($api.NODE_ENV -cne 'production' -or $api.TOP_DEPLOYMENT_PROFILE -cne 'lan-pilot' -or $api.EMAIL_DELIVERY_MODE -cne 'disabled' -or $api.APP_PUBLIC_URL -cne $origin -or $api.CORS_ORIGIN -cne $origin -or $api.S3_PUBLIC_ENDPOINT -cne $origin -or $api.S3_ENDPOINT -cne 'http://minio:9000' -or [string]$api.S3_FORCE_PATH_STYLE -cne 'true' -or $api.DATABASE_URL -cne $script:PilotEnv.DATABASE_URL -or $api.S3_ACCESS_KEY -cne $script:PilotEnv.S3_ACCESS_KEY -or $api.S3_SECRET_KEY -cne $script:PilotEnv.S3_SECRET_KEY -or $api.MINIO_ROOT_PASSWORD -or $api.MINIO_ROOT_USER -or $api.POSTGRES_PASSWORD -or $api.MIGRATION_DATABASE_URL) { throw 'La configuración de API no coincide con el perfil LAN explícito y separado de administración.' }
        if ($config.services.migrate.environment.DATABASE_URL -cne $script:PilotEnv.MIGRATION_DATABASE_URL) { throw 'El migrador debe usar exclusivamente la conexión propietaria de mantenimiento.' }
    }
    $config = $null
}

function Get-PilotContainers {
    $ids = (Invoke-PilotDocker -Arguments @('ps', '--all', '--quiet', '--filter', ('label=com.docker.compose.project=' + $script:PilotProject)) -Action 'inventario del proyecto propio').Output -split '\r?\n' | Where-Object { $_ }
    $records = @()
    $format = '{"id":{{json .Id}},"service":{{json .Config.Labels}},"image":{{json .Image}},"state":{{json .State}},"mounts":{{json .Mounts}},"ports":{{json .HostConfig.PortBindings}},"networks":{{json .NetworkSettings.Networks}},"logging":{{json .HostConfig.LogConfig.Type}},"privileged":{{json .HostConfig.Privileged}},"capAdd":{{json .HostConfig.CapAdd}},"networkMode":{{json .HostConfig.NetworkMode}},"devices":{{json .HostConfig.Devices}}}'
    foreach ($id in $ids) {
        $record = (Invoke-PilotDocker -Arguments @('inspect', '--format', $format, $id) -Action 'identidad del contenedor propio').Output | ConvertFrom-Json
        $records += $record
    }
    return $records
}

function ConvertFrom-PilotDockerHostPath([string]$Path) {
    if ($Path -match '^/(?:run/desktop/mnt/host|host_mnt|mnt)/([a-zA-Z])/(.*)$') { return [IO.Path]::GetFullPath(($Matches[1] + ':\' + $Matches[2].Replace('/', '\'))) }
    return [IO.Path]::GetFullPath($Path.Replace('/', '\'))
}

function Assert-PilotContainerEnvironment([string]$ContainerId, [string]$Service) {
    # Captura privada transitoria; nunca devuelve variables ni errores con sus valores.
    $pairs = (Invoke-PilotDocker -Arguments @('inspect', '--format', '{{json .Config.Env}}', $ContainerId) -Action 'comprobación privada del entorno efectivo').Output | ConvertFrom-Json
    $actual = @{}
    foreach ($pair in $pairs) { $parts = $pair -split '=', 2; if ($parts.Count -eq 2) { $actual[$parts[0]] = $parts[1] } }
    $origin = 'http://' + $script:PilotEnv.LAN_IP + ':3001'
    $expected = @{}
    if ($Service -eq 'api') {
        $expected = @{ NODE_ENV = 'production'; TOP_DEPLOYMENT_PROFILE = 'lan-pilot'; EMAIL_DELIVERY_MODE = 'disabled'; DATABASE_URL = $script:PilotEnv.DATABASE_URL; JWT_ACCESS_SECRET = $script:PilotEnv.JWT_ACCESS_SECRET; PASSWORD_RESET_OTP_SECRET = $script:PilotEnv.PASSWORD_RESET_OTP_SECRET; APP_PUBLIC_URL = $origin; CORS_ORIGIN = $origin; S3_PUBLIC_ENDPOINT = $origin; S3_ENDPOINT = 'http://minio:9000'; S3_BUCKET = $script:PilotEnv.S3_BUCKET; S3_ACCESS_KEY = $script:PilotEnv.S3_ACCESS_KEY; S3_SECRET_KEY = $script:PilotEnv.S3_SECRET_KEY; S3_FORCE_PATH_STYLE = 'true' }
        if ($actual.MINIO_ROOT_USER -or $actual.MINIO_ROOT_PASSWORD -or $actual.POSTGRES_PASSWORD -or $actual.MIGRATION_DATABASE_URL) { throw 'La API existente recibe credenciales de administración; no operar.' }
    } elseif ($Service -eq 'postgres') { $expected = @{ POSTGRES_USER = 'top_pilot'; POSTGRES_DB = 'top_pilot'; POSTGRES_PASSWORD = $script:PilotEnv.POSTGRES_PASSWORD } }
    elseif ($Service -eq 'minio') { $expected = @{ MINIO_ROOT_USER = $script:PilotEnv.MINIO_ROOT_USER; MINIO_ROOT_PASSWORD = $script:PilotEnv.MINIO_ROOT_PASSWORD } }
    elseif ($Service -eq 'gateway') { $expected = @{ LAN_IP = $script:PilotEnv.LAN_IP; S3_BUCKET = $script:PilotEnv.S3_BUCKET; NGINX_ENVSUBST_FILTER = '^(LAN_IP|S3_BUCKET)$' } }
    elseif ($Service -eq 'migrate') { $expected = @{ NODE_ENV = 'production'; DATABASE_URL = $script:PilotEnv.MIGRATION_DATABASE_URL } }
    foreach ($key in $expected.Keys) { if ($actual[$key] -cne $expected[$key]) { throw 'El entorno del contenedor existente difiere del candidato; no recrearlo ni operar sin revisión.' } }
    $actual = $null; $pairs = $null; $expected = $null
}

function Assert-PilotRuntime([switch]$Restore, [switch]$RequireData) {
    $records = @(Get-PilotContainers)
    $keys = @{ api = 'API_IMAGE'; gateway = 'FRONTEND_IMAGE'; postgres = 'POSTGRES_IMAGE'; minio = 'MINIO_IMAGE'; migrate = 'API_IMAGE' }
    $seen = @{}
    foreach ($record in $records) {
        $labels = $record.service
        $service = $labels.'com.docker.compose.service'
        if ($labels.'com.docker.compose.project' -cne $script:PilotProject -or $labels.'com.top.pilot.scope' -cne $script:PilotScope -or $labels.'com.top.pilot.source' -cne $script:PilotEnv.PILOT_SOURCE_COMMIT -or -not $keys.ContainsKey($service) -or ($Restore -and $service -notin @('postgres', 'minio')) -or $record.image -cne $script:PilotImageIds[$keys[$service]] -or $seen.ContainsKey($service)) { throw 'Identidad, imagen o servicio del proyecto inesperado; no operar.' }
        $seen[$service] = $record
        if ($record.logging -cne 'none' -or $record.privileged -or $record.capAdd -or $record.devices) { throw 'Logging o privilegios del contenedor existente difieren del perfil aprobado.' }
        Assert-PilotContainerEnvironment $record.id $service
        $bindings = @($record.ports.PSObject.Properties | Where-Object { $null -ne $_.Value -and @($_.Value).Count -gt 0 })
        if ($service -eq 'gateway' -and -not $Restore) {
            if ($bindings.Count -ne 1 -or $bindings[0].Name -cne '80/tcp' -or @($bindings[0].Value).Count -ne 1 -or $bindings[0].Value[0].HostIp -cne $script:PilotEnv.LAN_IP -or $bindings[0].Value[0].HostPort -cne '3001') { throw 'Binding del gateway diferente de la única IP/puerto aprobada.' }
        } elseif ($bindings.Count -gt 0) { throw 'Un servicio privado tiene un puerto host publicado.' }
        foreach ($mount in @($record.mounts)) {
            if ($service -in @('postgres', 'minio')) {
                $name = 'postgres_data'; $target = '/var/lib/postgresql/data'
                if ($service -eq 'minio') { $name = 'minio_data'; $target = '/data' }
                if ($mount.Type -cne 'volume' -or $mount.Name -cne ($script:PilotProject + '_' + $name) -or $mount.Destination -cne $target) { throw 'Un contenedor de datos monta un volumen ajeno.' }
            } elseif ($service -eq 'gateway') {
                $approvedSource = [IO.Path]::GetFullPath((Join-Path $script:PilotRoot 'gateway.conf.template'))
                if ($mount.Type -cne 'bind' -or $mount.RW -or $mount.Destination -cne '/etc/nginx/templates/default.conf.template' -or (ConvertFrom-PilotDockerHostPath $mount.Source) -ine $approvedSource) { throw 'Montaje de gateway inesperado.' }
            } else { throw 'Montaje no autorizado en un contenedor de aplicación.' }
        }
        if ($service -in @('postgres', 'minio') -and @($record.mounts).Count -ne 1) { throw 'Falta el volumen persistente exclusivo.' }
        $networks = @($record.networks.PSObject.Properties.Name | Sort-Object)
        $allowedNetworks = @('app'); if ($service -in @('postgres', 'migrate')) { $allowedNetworks = @('db') }; if ($service -eq 'api') { $allowedNetworks = @('app', 'db') }; if ($service -eq 'gateway') { $allowedNetworks = @('app', 'ingress') }; if ($Restore) { $allowedNetworks = @('isolated') }
        $expectedNetworks = @($allowedNetworks | ForEach-Object { $script:PilotProject + '_' + $_ } | Sort-Object)
        if (@(Compare-Object $expectedNetworks $networks).Count -ne 0) { throw 'Un contenedor del proyecto está conectado a redes inesperadas.' }
        if ($expectedNetworks -cnotcontains $record.networkMode) { throw 'El modo de red del contenedor no coincide con sus redes propias.' }
    }
    foreach ($volume in @('postgres_data', 'minio_data')) {
        $name = $script:PilotProject + '_' + $volume
        $inspection = Invoke-PilotDocker -Arguments @('volume', 'inspect', $name, '--format', '{{json .Labels}}') -Action 'identidad de volumen propio' -AllowFailure
        if ($inspection.ExitCode -ne 0) { if ($RequireData) { throw 'Falta un volumen de datos del piloto.' }; continue }
        $labels = $inspection.Output | ConvertFrom-Json
        if ($labels.'com.docker.compose.project' -cne $script:PilotProject -or $labels.'com.docker.compose.volume' -cne $volume -or $labels.'com.top.pilot.scope' -cne $script:PilotScope -or $labels.'com.top.pilot.source' -cne $script:PilotEnv.PILOT_SOURCE_COMMIT) { throw 'Un volumen existente no pertenece a este piloto.' }
        $users = (Invoke-PilotDocker -Arguments @('ps', '--all', '--quiet', '--filter', ('volume=' + $name)) -Action 'comprobación de consumidores de volumen propio').Output -split '\r?\n' | Where-Object { $_ }
        foreach ($id in $users) { if (@($records | Where-Object { $_.id.StartsWith($id) }).Count -ne 1) { throw 'Un contenedor ajeno está utilizando un volumen del proyecto; no operar.' } }
    }
    $networkNames = @('app', 'db', 'ingress'); if ($Restore) { $networkNames = @('isolated') }
    foreach ($network in $networkNames) {
        $name = $script:PilotProject + '_' + $network
        $inspection = Invoke-PilotDocker -Arguments @('network', 'inspect', $name, '--format', '{"id":{{json .Id}},"internal":{{json .Internal}},"labels":{{json .Labels}},"containers":{{json .Containers}}}') -Action 'identidad y miembros de red propia' -AllowFailure
        if ($inspection.ExitCode -ne 0) { if ($RequireData -and $network -ne 'ingress') { throw 'Falta una red privada del piloto.' }; continue }
        $record = $inspection.Output | ConvertFrom-Json
        if ($record.labels.'com.docker.compose.project' -cne $script:PilotProject -or $record.labels.'com.top.pilot.scope' -cne $script:PilotScope -or $record.labels.'com.top.pilot.source' -cne $script:PilotEnv.PILOT_SOURCE_COMMIT -or ($network -ne 'ingress' -and -not $record.internal)) { throw 'La red existente no corresponde al proyecto privado esperado.' }
        foreach ($memberId in @($record.containers.PSObject.Properties.Name | Where-Object { $_ })) {
            if (@($records | Where-Object { $_.id -ceq $memberId }).Count -ne 1) { throw 'Un contenedor ajeno está conectado a una red del piloto; no operar ni alterar el entorno ajeno.' }
        }
        foreach ($container in $records) {
            $connection = $container.networks.$name
            if ($connection -and (($connection.NetworkID -and $connection.NetworkID -cne $record.id) -or ($container.state.Running -and -not $connection.NetworkID))) { throw 'El ID de una conexión de red del contenedor no coincide con la red propia inspeccionada.' }
        }
    }
    if ($RequireData -and (-not $seen.ContainsKey('postgres') -or -not $seen.ContainsKey('minio'))) { throw 'Faltan servicios de datos del proyecto propio.' }
    return $seen
}

function Assert-PilotPortFree {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue)
    $ownGateway = @(Get-PilotContainers | Where-Object { $_.service.'com.docker.compose.service' -eq 'gateway' -and $_.state.Running })
    if ($listeners.Count -gt 0 -and $ownGateway.Count -ne 1) { throw 'El puerto 3001 está ocupado; no cerrar ni reemplazar el proceso ajeno.' }
}

function Assert-PilotListener {
    try { $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction Stop) } catch { throw 'No se pudo verificar el listener Windows de puerto 3001; no habilitar uso real.' }
    if ($listeners.Count -eq 0 -or @($listeners | Where-Object { $_.LocalAddress -cne $script:PilotEnv.LAN_IP -or $_.LocalPort -ne 3001 }).Count -gt 0) {
        throw 'Windows muestra binding ausente, amplio o diferente de LAN_IP:3001. No declarar aislamiento por el binding Docker; revisar localmente sin cambiar firewall.'
    }
}

function Wait-PilotData([int]$TimeoutSeconds = 120) {
    $limit = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $state = Assert-PilotRuntime -RequireData
        if (-not $state.postgres.state.Running -or -not $state.minio.state.Running) { throw 'Un servicio de datos se detuvo durante readiness; revisar localmente.' }
        $ready = Invoke-PilotDocker -Arguments @('exec', $state.postgres.id, 'pg_isready', '-U', 'top_pilot', '-d', 'top_pilot') -Action 'readiness PostgreSQL' -AllowFailure
        if ($ready.ExitCode -eq 0 -and $state.minio.state.Health.Status -eq 'healthy') { return }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $limit)
    throw 'PostgreSQL/MinIO no alcanzaron readiness dentro del límite; datos preservados.'
}

function Wait-PilotDataForRestore([int]$TimeoutSeconds = 120) {
    $limit = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $state = Assert-PilotRuntime -Restore -RequireData
        if (-not $state.postgres.state.Running -or $state.minio.state.Running) { throw 'Estado de los servicios del clon inesperado; MinIO debe estar detenido.' }
        $ready = Invoke-PilotDocker -Arguments @('exec', $state.postgres.id, 'pg_isready', '-U', 'top_pilot', '-d', 'top_pilot') -Action 'readiness PostgreSQL nuevo de restore' -AllowFailure
        if ($ready.ExitCode -eq 0) { return }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $limit)
    throw 'PostgreSQL de restore no alcanzó readiness; destino preservado y origen intacto.'
}

function Invoke-PilotSql([string]$ContainerId, [string]$Sql) {
    return (Invoke-PilotDocker -Arguments @('exec', '-i', $ContainerId, 'psql', '-X', '-q', '--no-password', '-U', 'top_pilot', '-d', 'top_pilot', '-A', '-t', '-F', "`t", '--set', 'ON_ERROR_STOP=1') -InputText $Sql -Action 'consulta SQL privada del piloto').Output.Trim()
}

function Assert-PilotDatabase([string]$ContainerId, [switch]$NoClients, [switch]$Empty) {
    $identity = Invoke-PilotSql $ContainerId 'SELECT current_database() || ''|'' || current_user;'
    if ($identity -cne 'top_pilot|top_pilot') { throw 'La identidad SQL no coincide con la base exclusiva esperada.' }
    if ($NoClients -and (Invoke-PilotSql $ContainerId 'SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type=''client backend'';') -cne '0') { throw 'Existen otras conexiones a la base del piloto; cerrar la ventana de escrituras antes de continuar.' }
    if ($Empty -and (Invoke-PilotSql $ContainerId 'SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN (''pg_catalog'',''information_schema'') AND n.nspname NOT LIKE ''pg_toast%'' AND c.relkind IN (''r'',''p'',''v'',''m'',''S'');') -cne '0') { throw 'El destino de restore no está vacío; no sobrescribirlo.' }
}

function Assert-PilotApplicationRole([string]$ContainerId, [switch]$RequireLogin) {
    $requiredLogin = 'false'; if ($RequireLogin) { $requiredLogin = 'true' }
    # Sólo retorna un booleano. Password verificable únicamente por auth de la
    # API; aquí se comprueba existencia sin leer/devolver su valor o hash.
    $sql = @'
WITH app AS (SELECT * FROM pg_roles WHERE rolname='top_pilot_app')
SELECT count(*)=1 AND bool_and(
    (NOT __REQUIRE_LOGIN__ OR (a.rolcanlogin AND EXISTS(SELECT 1 FROM pg_authid WHERE oid=a.oid AND rolpassword IS NOT NULL)))
    AND NOT a.rolsuper AND NOT a.rolcreatedb AND NOT a.rolcreaterole
    AND NOT a.rolreplication AND NOT a.rolbypassrls AND NOT a.rolinherit
    AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=a.oid OR roleid=a.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=a.oid AND deptype='o')
    AND has_database_privilege(a.oid,'top_pilot','CONNECT')
    AND NOT has_database_privilege(a.oid,'top_pilot','CREATE,TEMPORARY')
    AND NOT EXISTS(SELECT 1 FROM pg_database d WHERE d.datallowconn AND d.datname<>'top_pilot' AND has_database_privilege(a.oid,d.oid,'CONNECT,CREATE,TEMPORARY'))
    AND has_schema_privilege(a.oid,'public','USAGE')
    AND NOT has_schema_privilege(a.oid,'public','CREATE')
    AND to_regclass('public._prisma_migrations') IS NOT NULL
    AND NOT has_table_privilege(a.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT EXISTS(
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
          AND c.relname<>'_prisma_migrations' AND (
            pg_get_userbyid(c.relowner)<>'top_pilot'
            OR NOT has_table_privilege(a.oid,c.oid,'SELECT')
            OR NOT has_table_privilege(a.oid,c.oid,'INSERT')
            OR NOT has_table_privilege(a.oid,c.oid,'UPDATE')
            OR NOT has_table_privilege(a.oid,c.oid,'DELETE')
            OR has_table_privilege(a.oid,c.oid,'TRUNCATE,REFERENCES,TRIGGER')
            OR has_table_privilege(a.oid,c.oid,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
          )
    )
    AND NOT EXISTS(
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='S' AND (
            pg_get_userbyid(c.relowner)<>'top_pilot'
            OR NOT has_sequence_privilege(a.oid,c.oid,'USAGE')
            OR NOT has_sequence_privilege(a.oid,c.oid,'SELECT')
            OR has_sequence_privilege(a.oid,c.oid,'UPDATE')
            OR has_sequence_privilege(a.oid,c.oid,'USAGE WITH GRANT OPTION,SELECT WITH GRANT OPTION')
          )
    )
    AND NOT EXISTS(
        SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('public','pg_catalog','information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
          AND has_schema_privilege(a.oid,n.oid,'USAGE,CREATE')
    )
    AND NOT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
    )
) FROM app a;
'@
    $result = Invoke-PilotSql $ContainerId ($sql.Replace('__REQUIRE_LOGIN__', $requiredLogin))
    if ($result -cne 't') { throw 'El rol API no cumple LOGIN/permisos limitados/membresías/propiedad esperados. Mantener aplicación apagada y revisar localmente.' }
}

function Invoke-PilotApplicationRoleProvision([string]$ContainerId) {
    Assert-PilotDatabase $ContainerId -NoClients
    $sqlPath = Join-Path $script:PilotRoot 'sql/provision-app-role.sql'
    [void](Invoke-PilotSql $ContainerId ([IO.File]::ReadAllText($sqlPath, [Text.Encoding]::UTF8)))
    if ((Invoke-PilotSql $ContainerId "SELECT rolcanlogin FROM pg_roles WHERE rolname='top_pilot_app';") -cne 'f') { throw 'No se pudo confirmar rol NOLOGIN. Mantener aplicación/clon detenidos y revisar localmente.' }
    Assert-PilotApplicationRole $ContainerId
}

function Get-PilotDatabaseAuthenticationCode {
    # Sin URL, contraseña, overrides ni datos de usuario en argv/stdout. El
    # cliente usa DATABASE_URL del API y valida su artifact antes de importarlo.
    return @'
'use strict';
let client;
let authenticated = false;
const deadline = setTimeout(() => process.exit(1), 10000);
(async () => {
  try {
    require('./dist/src/config/prisma-environment').validateProductionPrismaArtifact();
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient({ log: [] });
    const rows = await client.$queryRawUnsafe('SELECT current_database()::text AS database_name, current_user::text AS actor_name');
    authenticated = Array.isArray(rows) && rows.length === 1 && rows[0].database_name === 'top_pilot' && rows[0].actor_name === 'top_pilot_app';
  } catch { authenticated = false; }
  finally {
    if (client) { try { await client.$disconnect(); } catch { authenticated = false; } }
    clearTimeout(deadline);
    if (authenticated) { process.stdout.write('TOP_PILOT_DATABASE_AUTHENTICATED\n'); }
    else { process.exitCode = 1; }
  }
})().catch(() => process.exit(1));
'@
}

function Assert-PilotApiDatabaseAuthentication([string]$ContainerId) {
    Assert-PilotProject $script:PilotProject
    if ($script:PilotScope -cne 'lan-pilot') { throw 'Probe SQL limitado al API propio del piloto LAN.' }
    $state = Assert-PilotRuntime -RequireData
    if (-not $state.ContainsKey('api') -or $state.api.id -cne $ContainerId -or -not $state.api.state.Running -or ($state.ContainsKey('gateway') -and $state.gateway.state.Running)) { throw 'Autenticación SQL requiere API propio activo y gateway detenido; no publicar.' }
    try { $result = Invoke-PilotDocker -Arguments @('exec', '--interactive', $ContainerId, 'node', '--input-type=commonjs', '-') -InputText (Get-PilotDatabaseAuthenticationCode) -Action 'autenticación SQL privada del API' -AllowFailure -TimeoutSeconds 20 }
    catch { throw 'La autenticación SQL privada falló o agotó su plazo; no publicar gateway. Detalles sensibles omitidos.' }
    if ($result.ExitCode -ne 0 -or $result.Output -cne "TOP_PILOT_DATABASE_AUTHENTICATED`n") { throw 'El API no autenticó la base y rol esperados; no publicar gateway. Detalles sensibles omitidos.' }
}

function Wait-PilotApiPrivate([int]$TimeoutSeconds = 120) {
    $limit = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $state = Assert-PilotRuntime -RequireData
        if (($state.ContainsKey('gateway') -and $state.gateway.state.Running) -or -not $state.ContainsKey('api') -or -not $state.api.state.Running) { throw 'API debe estar activo y gateway detenido durante readiness privado.' }
        if ($state.api.state.Health.Status -ceq 'healthy') { return $state.api.id }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $limit)
    throw 'API no alcanzó readiness privado dentro del plazo; no publicar gateway.'
}

function Get-PilotTableCounts([string]$ContainerId) {
    $sql = @'
SELECT format('SELECT %L || chr(9) || count(*)::text FROM %I.%I;', n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname,c.relname
\gexec
'@
    return Invoke-PilotSql $ContainerId $sql
}

function Write-PilotPrivateFile([string]$Path, [string]$Text) {
    $encoding = New-Object Text.UTF8Encoding($false)
    $stream = New-Object IO.FileStream($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = $encoding.GetBytes($Text); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    Assert-PilotRestrictedAcl $Path
}

function Invoke-PilotHelper([string]$VolumeName, [string]$BackupDirectory, [string]$Command, [switch]$WriteVolume, [switch]$ReadBackup, [string]$InputText, [switch]$RestoreOwnership, [switch]$ReadObjectsBackup) {
    if ($VolumeName -cne ($script:PilotProject + '_minio_data')) { throw 'Helper limitado al volumen MinIO propio.' }
    if ($BackupDirectory.Contains(',')) { throw 'Ruta backup incompatible con mount Docker; no admitir coma.' }
    if ($ReadObjectsBackup) {
        Assert-PilotProject $script:PilotProject
        if ($WriteVolume -or $ReadBackup -or $RestoreOwnership -or $script:PilotScope -cne 'lan-pilot' -or -not [string]::IsNullOrEmpty($InputText)) { throw 'DAC_READ_SEARCH sólo se permite para backup propio detenido, volumen read-only y destino protegido nuevo.' }
        $state = Assert-PilotRuntime -RequireData
        if ($state.minio.state.Running) { throw 'MinIO debe estar detenido para leer un backup coherente.' }
        $BackupDirectory = Resolve-PilotProtectedPath $BackupDirectory $script:PilotRoot -Directory
        Assert-PilotRestrictedAcl (Split-Path -Parent $BackupDirectory)
        foreach ($item in @(Get-ChildItem -LiteralPath $BackupDirectory -Force -ErrorAction Stop)) {
            if ($item.PSIsContainer -or $item.Name -cnotin @('postgres.dump', 'postgres-counts.tsv')) { throw 'Destino backup no nuevo: contiene artefactos o rutas inesperadas.' }
            Assert-PilotNoReparse $item.FullName
            Assert-PilotRestrictedAcl $item.FullName
        }
    }
    if ($RestoreOwnership) {
        Assert-PilotProject $script:PilotProject -Restore
        if (-not $WriteVolume -or -not $ReadBackup -or $script:PilotScope -cne 'restore' -or [string]::IsNullOrEmpty($InputText)) { throw 'CHOWN sólo se permite para restaurar metadata del clon nuevo, con backup read-only e inventario privado.' }
        $state = Assert-PilotRuntime -Restore -RequireData
        if ($state.minio.state.Running) { throw 'MinIO debe permanecer detenido durante la restauración de propietarios.' }
    }
    $volumeMount = 'type=volume,src=' + $VolumeName + ',dst=/data'
    if (-not $WriteVolume) { $volumeMount += ',readonly' }
    $backupMount = 'type=bind,src=' + $BackupDirectory + ',dst=/backup'
    if ($ReadBackup) { $backupMount += ',readonly' }
    # Si el helper aprobado es postgres:alpine, cubrir su VOLUME de imagen con
    # tmpfs evita un volumen anónimo adicional; aquí no se inicia PostgreSQL.
    $arguments = @('run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', '--user', '0:0', '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,nodev')
    if ($RestoreOwnership) { $arguments += @('--cap-add', 'CHOWN') }
    if ($ReadObjectsBackup) { $arguments += @('--cap-add', 'DAC_READ_SEARCH') }
    if (-not [string]::IsNullOrEmpty($InputText)) { $arguments += '--interactive' }
    $arguments += @('--label', ('com.top.pilot.scope=' + $script:PilotScope), '--label', ('com.docker.compose.project=' + $script:PilotProject), '--mount', $volumeMount, '--mount', $backupMount, '--entrypoint', '/bin/sh', $script:PilotEnv.HELPER_IMAGE, '-c', $Command)
    [void](Invoke-PilotDocker -Arguments $arguments -InputText $InputText -Action 'helper privado de backup/restore')
}

function Read-PilotTarText([byte[]]$Header, [int]$Offset, [int]$Length) {
    for ($i = $Offset; $i -lt $Offset + $Length; $i++) { if ($Header[$i] -gt 127) { throw 'El tar contiene nombres no ASCII no soportados; no extraer.' } }
    $value = [Text.Encoding]::ASCII.GetString($Header, $Offset, $Length).TrimEnd([char]0)
    if ($value -cmatch '[\x00-\x1f\x7f-\uffff]') { throw 'El tar contiene texto o extensiones no soportadas; no extraer.' }
    return $value
}

function Read-PilotTarOctal([byte[]]$Header, [int]$Offset, [int]$Length) {
    $value = [Text.Encoding]::ASCII.GetString($Header, $Offset, $Length).Trim([char[]]@([char]0, [char]32))
    if ($value -cnotmatch '^[0-7]+$') { throw 'El tar contiene campos numéricos no octales o no soportados.' }
    try { return [Convert]::ToInt64($value, 8) } catch { throw 'Un campo numérico del tar excede el rango soportado.' }
}

function ConvertTo-PilotTarPath([string]$Name, [bool]$Directory) {
    if ($Name -in @('.', './')) { if (-not $Directory) { throw 'La raíz del tar debe ser un directorio.' }; return '.' }
    if ($Name.StartsWith('./')) { $Name = $Name.Substring(2) }
    if ($Directory) { $Name = $Name.TrimEnd('/') }
    if ([string]::IsNullOrEmpty($Name) -or $Name.StartsWith('/') -or $Name.Contains('\') -or $Name -cmatch '[\x00-\x20\x7f-\uffff]') { throw 'El tar contiene una ruta no canónica o no soportada.' }
    if (@($Name.Split('/') | Where-Object { $_ -in @('', '.', '..') }).Count -gt 0) { throw 'El tar contiene traversal o componentes de ruta ambiguos.' }
    return './' + $Name
}

function Read-PilotArchiveMetadata([IO.Stream]$Stream) {
    if (-not $Stream.CanRead -or -not $Stream.CanSeek -or $Stream.Length -lt 1024 -or $Stream.Length % 512 -ne 0) { throw 'El archivo tar no tiene una estructura de bloques válida.' }
    $entries = New-Object 'System.Collections.Generic.List[object]'
    $seen = New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
    $zeroBlocks = 0
    $longName = $null
    while ($Stream.Position -lt $Stream.Length) {
        $header = New-Object byte[] 512
        if ($Stream.Read($header, 0, 512) -ne 512) { throw 'El tar tiene un header truncado.' }
        if (@($header | Where-Object { $_ -ne 0 }).Count -eq 0) { $zeroBlocks++; continue }
        if ($zeroBlocks -gt 0) { throw 'El tar contiene datos después de su terminador; no extraer.' }
        $sum = 0L
        for ($i = 0; $i -lt 512; $i++) { if ($i -ge 148 -and $i -lt 156) { $sum += 32 } else { $sum += $header[$i] } }
        $magic = [Text.Encoding]::ASCII.GetString($header, 257, 6)
        $version = [Text.Encoding]::ASCII.GetString($header, 263, 2)
        $ustar = $magic -ceq ("ustar" + [char]0) -and $version -ceq '00'
        $gnu = $magic -ceq 'ustar ' -and $version -ceq (" " + [char]0)
        if ($sum -ne (Read-PilotTarOctal $header 148 8) -or (-not $ustar -and -not $gnu)) { throw 'Tar no soportado: requiere ustar/GNU básico y checksum válido.' }
        # BusyBox interpreta este bloque como prefix incluso con magic GNU;
        # rechazar metadata GNU extra evita rutas distintas de las validadas.
        if ($gnu -and @($header[345..499] | Where-Object { $_ -ne 0 }).Count -gt 0) { throw 'GNU con metadata extra/prefix ambiguo no soportado; no extraer.' }
        $size = Read-PilotTarOctal $header 124 12
        $payload = [long]([Math]::Ceiling($size / 512.0) * 512)
        if ($payload -gt $Stream.Length - $Stream.Position) { throw 'El contenido de un archivo tar está truncado.' }
        if ($header[156] -eq 76) {
            # GNU LongName modifica exclusivamente el nombre del siguiente archivo
            # o directorio. No se aceptan LongLink, PAX ni payload arbitrario.
            if ($longName -or (Read-PilotTarText $header 0 100) -cne '././@LongLink' -or $size -lt 2 -or $size -gt 4095) { throw 'Extensión GNU LongName ambigua o no soportada.' }
            $nameBytes = New-Object byte[] ([int]$size)
            if ($Stream.Read($nameBytes, 0, [int]$size) -ne $size -or $nameBytes[$size - 1] -ne 0 -or @($nameBytes | Where-Object { $_ -gt 127 }).Count -gt 0) { throw 'GNU LongName truncado o no ASCII.' }
            $longName = [Text.Encoding]::ASCII.GetString($nameBytes, 0, [int]$size - 1)
            [void]$Stream.Seek($payload - $size, [IO.SeekOrigin]::Current)
            continue
        }
        $kind = 'file'
        if ($header[156] -eq 53) { $kind = 'directory' } elseif ($header[156] -notin @(0, 48)) { throw 'No se admiten links, dispositivos, FIFOs, PAX ni otras extensiones GNU en el tar.' }
        if ((Read-PilotTarText $header 157 100).Length -gt 0) { throw 'El tar contiene un destino de link no permitido.' }
        $name = Read-PilotTarText $header 0 100
        $prefix = ''; if ($ustar) { $prefix = Read-PilotTarText $header 345 155 }
        if ($prefix) { $name = $prefix + '/' + $name }
        if ($longName) { $name = $longName; $longName = $null }
        $path = ConvertTo-PilotTarPath $name ($kind -eq 'directory')
        if ($seen.ContainsKey($path)) { throw 'El tar contiene rutas duplicadas o colisiones de tipos.' }
        $uid = Read-PilotTarOctal $header 108 8
        $gid = Read-PilotTarOctal $header 116 8
        $mode = Read-PilotTarOctal $header 100 8
        if ($uid -gt 4294967294 -or $gid -gt 4294967294 -or $mode -gt 511 -or ($kind -eq 'directory' -and $size -ne 0)) { throw 'UID/GID/modo o tamaño no soportado; no reparar permisos automáticamente.' }
        [void]$Stream.Seek($payload, [IO.SeekOrigin]::Current)
        $entry = [pscustomobject]@{ Path = $path; Kind = $kind; Uid = $uid; Gid = $gid; ModeValue = $mode; Mode = [Convert]::ToString($mode, 8) }
        $seen[$path] = $entry
        $entries.Add($entry)
    }
    if ($longName -or $zeroBlocks -lt 2 -or -not $seen.ContainsKey('.') -or $seen['.'].Kind -cne 'directory') { throw 'El tar debe incluir metadata de raíz, LongName completo y terminador válido.' }
    foreach ($entry in $entries) {
        $path = $entry.Path
        while ($path -ne '.') {
            $path = $path.Substring(0, $path.LastIndexOf('/'))
            if (-not $seen.ContainsKey($path) -or $seen[$path].Kind -cne 'directory') { throw 'El tar omite un directorio padre o usa un archivo como padre.' }
        }
    }
    return $entries.ToArray()
}

function Get-PilotArchiveMetadata([string]$Path) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try { return @(Read-PilotArchiveMetadata $stream) } finally { $stream.Dispose() }
}

function Assert-PilotArchiveImageCompatibility([object[]]$Metadata, [string]$ImageUser) {
    if ($ImageUser -in @('', '0', '0:0')) { return }
    if ($ImageUser -cnotmatch '^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$') { throw 'La imagen MinIO debe declarar UID/GID numéricos verificables o usar el root por defecto; no asumir usuarios/grupos por nombre.' }
    try { $uid = [long]$Matches[1]; $gid = [long]$Matches[2] } catch { throw 'UID/GID de la imagen fuera del rango soportado.' }
    if ($uid -gt 4294967294 -or $gid -gt 4294967294) { throw 'UID/GID de la imagen fuera del rango soportado.' }
    if ($uid -eq 0) { return }
    foreach ($entry in $Metadata) {
        $required = 384; if ($entry.Kind -eq 'directory') { $required = 448 }
        if ($entry.Uid -ne $uid -or $entry.Gid -ne $gid -or ($entry.ModeValue -band $required) -ne $required) { throw 'Los propietarios/permisos del backup son incompatibles con la imagen MinIO no root; conservar datos y revisar, sin chmod/chown del origen.' }
    }
}

function ConvertTo-PilotOwnershipInventory([object[]]$Metadata) {
    $lines = foreach ($entry in ($Metadata | Sort-Object @{ Expression = { $_.Path.Split('/').Length }; Descending = $true }, @{ Expression = { $_.Path }; Descending = $false })) {
        $entry.Uid.ToString() + "`t" + $entry.Gid.ToString() + "`t" + $entry.Mode + "`t" + $entry.Kind + "`t" + $entry.Path
    }
    return ($lines -join "`n") + "`n"
}

function Get-PilotRestoreObjectsCommand {
    # Hashes y modos se verifican antes del chown; padres permanecen de UID 0
    # hasta verificar sus hijos. Sólo CHOWN es necesario, no DAC_OVERRIDE/FOWNER.
    return 'set -eu; entries=$(ls -A /data); test -z "$entries"; cd /data; tar -xpf /backup/minio.tar --no-same-owner; if test -s /backup/minio-files.sha256; then sha256sum -c /backup/minio-files.sha256 >/dev/null; fi; expected=$(wc -l </backup/minio-files.sha256); files=$(find . -type f); if test -z "$files"; then actual=0; else actual=$(printf "%s\n" "$files" | wc -l); fi; test "$expected" -eq "$actual"; while IFS="$(printf "\t")" read -r uid gid mode kind path; do if test "$path" = .; then path=/data; cd /; fi; test ! -L "$path"; if test "$kind" = directory; then test -d "$path"; else test -f "$path"; fi; before=$(stat -c "%u:%g:%a" -- "$path"); test "${before##*:}" = "$mode"; if test "$before" != "$uid:$gid:$mode"; then chown -- "$uid:$gid" "$path"; fi; actual=$(stat -c "%u:%g:%a" -- "$path"); test "$actual" = "$uid:$gid:$mode"; done'
}

function Get-PilotFileRecord([string]$Directory, [string]$Name) {
    $path = Join-Path $Directory $Name
    $item = Get-Item -LiteralPath $path -ErrorAction Stop
    if ($item.Length -le 0 -and $Name -notin @('minio-files.sha256', 'postgres-counts.tsv')) { throw 'Un archivo requerido de datos del respaldo está vacío.' }
    Assert-PilotRestrictedAcl $path
    return [pscustomobject]@{ name = $Name; bytes = $item.Length; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
}
