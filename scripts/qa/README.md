# QA local portable de TOP para Windows PowerShell

Paquete de soporte externo a la aplicación, preparado a partir de scripts QA existentes. Preparación inicial: análisis de sintaxis. El smoke posterior verificó seis respuestas HTTP y cierre propio, con fallo separado del recolector; ver la evidencia al final. No se repitieron suites completas. No incluye harness privado: arranca el bootstrap normal `backend/dist/src/main.js` en `NODE_ENV=development`, con base/correo/secrets sintéticos y storage en memoria. El recorrido interactivo con API real que consta en el informe anterior usó otro launcher/harness; ese PASS no valida esta adaptación portable.

Usar un clon dedicado limpio de TOP-Platform y extraer este paquete en una carpeta externa al clon. Requiere Windows PowerShell 5.1 o PowerShell 7, Git, Node compatible, npm CLI local, Docker operativo con contenedores Linux y la imagen `postgres:16-alpine` disponible. README/CI oficiales del backend usan Node 22. La evidencia local anterior usa Node 24.19.0/npm 9.8.1 y no acredita CI22. No modifica Git global ni elimina archivos env. Se rechazan archivos env del clon para evitar consumir configuración ajena.

El corte documental local es `c9da5f2f48446666f9f68293463eaafc02d32aed`; código QA `ee038ce9e94b8f8c7d0b61f9f5cd4fc61f8b9d9c`; árbol backend `55a2290d933a810bd1c60249738d6c204a5d2df6`. La implementación está publicada en PR #101 Draft; el HEAD publicado 6e registra CI oficial Node 22 SUCCESS: Backend run 36861110824 y Frontend run 36861110999. Los árboles backend 55a2290d933a810bd1c60249738d6c204a5d2df6 y frontend 94633656e5d5010c24c75300171377aa4aca75e7 permanecen idénticos. Incorporar la rama de PR #101 en el clon dedicado y verificar el HEAD/árbol elegido antes de ejecutar. Esa CI valida el código publicado, no este paquete portable, cuyo smoke posterior se documenta al final. No ejecutar contra el checkout principal, bases existentes ni recursos de otra sesión.

## 1. Configurar rutas e instalar las dependencias del clon

Reemplazar solamente las tres rutas por las de tu equipo. `NpmCliPath` es el archivo JavaScript npm-cli.js de tu instalación, no npm.cmd. Ejecutar desde la carpeta del paquete extraído.

```powershell
$taskRepoRoot = 'C:\QA\TOP-Platform'
$taskNodeExecutable = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$taskNpmCliPath = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
. .\Set-QAEnvironment.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath
Push-Location -LiteralPath (Join-Path $taskRepoRoot 'backend')
& $taskNodeExecutable $taskNpmCliPath ci
if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci backend.' }
Pop-Location
Push-Location -LiteralPath (Join-Path $taskRepoRoot 'frontend')
& $taskNodeExecutable $taskNpmCliPath ci
if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci frontend.' }
Pop-Location
```

No instalar globalmente ni cambiar lockfiles. Los scripts no instalan dependencias. El entorno usa exactamente `top_test`, actor `top_night_test`, URL `postgresql://top_night_test:top-night-integration-synthetic-20261001@127.0.0.1:55473/top_test?schema=public`, email console y storage memoria. JWT/OTP son valores públicos sintéticos. Abrir una shell dedicada porque Set-QAEnvironment cambia variables y PATH.

## 2. Crear PostgreSQL efímero propio

**Comando reconstruido, no ejecutado en la preparación del paquete.** Captura el ID nuevo y utiliza un nombre y label de sesión únicos. No reutilizar contenedores, ni el ID histórico ya eliminado. `--pull never` evita descargas implícitas; si falta imagen o permiso Docker, detener el procedimiento.

```powershell
$taskPgRunId = [Guid]::NewGuid().ToString('N')
$taskPgName = 'top-portable-qa-pg-' + $taskPgRunId
$taskPgListeners = @(Get-NetTCPConnection -LocalPort 55473 -State Listen -ErrorAction SilentlyContinue)
if ($taskPgListeners.Count -ne 0) { throw '55473 ocupado; no tocar el proceso existente.' }
& docker image inspect postgres:16-alpine --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'Falta imagen local o acceso Docker.' }
$taskPgContainerId = (& docker run --pull never --detach --rm --name $taskPgName --label "top.portable.qa.run=$taskPgRunId" --tmpfs '/var/lib/postgresql/data:rw,size=512m' --publish '127.0.0.1:55473:5432' --env 'POSTGRES_USER=top_night_test' --env 'POSTGRES_PASSWORD=top-night-integration-synthetic-20261001' --env 'POSTGRES_DB=top_test' --health-cmd 'pg_isready -U top_night_test -d top_test' postgres:16-alpine | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $taskPgContainerId -notmatch '^[0-9a-f]{64}$') { throw 'No se obtuvo ID propio válido.' }
$env:TOP_QA_PG_CONTAINER_NAME = $taskPgName
& docker inspect --format '{{.State.Health.Status}}' $taskPgContainerId
& docker exec $taskPgContainerId pg_isready -U top_night_test -d top_test
```

Esperar healthy/accepting connections antes de continuar. Conservar ID, nombre y runId nuevos hasta el cierre. No usar Compose del producto: tiene otros puertos y volúmenes persistentes. Esta DB desaparece al detener PG; las credenciales ficticias solo sirven en este entorno descartable.

## 3. Migraciones y gates backend en serie

```powershell
& .\Run-BackendGates.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath -PgContainerId $taskPgContainerId -PgName $taskPgName -PgRunId $taskPgRunId -EjecutarGates
```

Secuencia: generate, identidad SQL exacta, validate, migrate deploy, build, lint, unit --runInBand, integration, e2e --runInBand, acceptance, coverage, architecture. No migrate dev. Antes de gates, seed y arranque se inspeccionan funcionalmente ID completo/nombre/runId-label únicos, imagen, tmpfs, cero mounts, loopback/puerto, healthy, identidad SQL y cero otros client backend en todo el servidor; si falta acceso Docker o alguna guarda falla, no se ejecuta. El script conserva comandos/exit codes en `runs/gates-<timestamp>/results.json`, falla al primer control fallido y exige fuente limpia/HEAD/árbol estables. Copiar el paquete a una carpeta externa de ejecución, nunca correrlo desde el clon: runs y qa-fixtures.json son salidas locales que no deben versionarse. Continuar solo si conclusion es `all_listed_gates_passed_for_recorded_backend_tree`. No ejecuta mutation ni CI. Integración/E2E y aceptación @postgres limpian la DB: seed va después. No ejecutar navegador u otras suites contra esta base al mismo tiempo.

## 4. Seed QA y build frontend

```powershell
& .\Seed-QAFixtures.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath -PgContainerId $taskPgContainerId -PgName $taskPgName -PgRunId $taskPgRunId -GatesTerminados
. .\Set-QAEnvironment.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath
Push-Location -LiteralPath (Join-Path $taskRepoRoot 'frontend')
& $taskNodeExecutable $taskNpmCliPath run build
if ($LASTEXITCODE -ne 0) { throw 'Falló build frontend QA.' }
Pop-Location
```

El seed reutiliza el existente, mantiene guardas test/URL/actor/.env/SMTP/S3, requiere cliente y columna displayName migrados, usa upsert update:{} y verifica hashes Argon2. No tiene SQL DELETE ni reset destructivo. Genera `qa-fixtures.json` en el paquete. El seed Prisma del producto solo crea Amenities y no reemplaza este fixture. No crear usuarios reales.

| Rol en negocio A | Email ficticio | Contraseña sintética |
|---|---|---|
| OWNER | owner@top-night.example.invalid | TopNight.Owner!2026-10-01 |
| ADMIN | admin@top-night.example.invalid | TopNight.Admin!2026-10-01 |
| RECEPTIONIST | receptionist@top-night.example.invalid | TopNight.Reception!2026-10-01 |
| VIEWER | viewer@top-night.example.invalid | TopNight.Viewer!2026-10-01 |

OWNER tiene A+B; los otros tres solo A. Son 4 usuarios ACTIVE/verificados, 2 negocios/5 membresías/2 recursos sin fotos/2 contactos/7 reservas de lectura/2 bloques. B está vacío de reservas/recursos. No hay snapshots de precio, payments ni payment plans: este fixture no acredita lifecycle ni finanzas. Fechas relativas a hoy en America/Asuncion.

## 5. Arrancar el bootstrap normal y hacer QA

```powershell
& .\Start-QA.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath -PgContainerId $taskPgContainerId -PgName $taskPgName -PgRunId $taskPgRunId -LanzarQA
```

Para frontend dev, en otra sesión exclusiva cerrando primero la anterior: añadir `-DevelopmentFrontend`. API `http://127.0.0.1:3047/api`; health `/api/health`; frontend `http://127.0.0.1:4177`. NODE_ENV=development solo para el arranque normal; DB sigue siendo test descartable, correo console/memoria. CORS exactos 127.0.0.1:4177 y localhost:4177. Build preview debe contener VITE_API_URL=http://127.0.0.1:3047/api, que ya establece Set-QAEnvironment. El launcher rechaza puertos ocupados y genera un manifest NUEVO en runs/runtime-<timestamp>/processes.json con PID/startTime/executable/commandLine/args. Readiness tiene espera acotada de 180 segundos (parámetro -ReadyTimeoutSeconds entre 10 y 300) y comprueba salida de los procesos en cada poll; nunca espera más de 500 ms entre intentos. El primer smoke fresco agotó la ventana anterior sin error en logs API; esa falla se conserva, y una hipótesis de carga/IO lenta motivó solo esta mejora de soporte. El cierre propio de ese intento sí se verificó; no se atribuye PASS al intento fallido. Si falla arranque puede haber procesos propios activos: usar ese manifest para cierre verificado; si no se pudo capturar metadata completa, inspeccionar manualmente y no desactivar guardas.

**Limitación del bootstrap normal actual:** app.listen usa PORT sin fijar interfaz; API puede escuchar en interfaces distintas de loopback. Se conserva la aplicación intacta. Usar una máquina local QA dedicada con red restringida; PG y Vite sí se publican en loopback. No presentar este paquete como hosting/producción. El smoke posterior acredita solo los controles indicados al final. La readiness HTTP200 futura solo constata arranque, no sustituye suites ni QA manual.

## 6. Cerrar exclusivamente recursos propios

Cerrar navegador/tests propios y tomar el path exacto mostrado por Start-QA:

```powershell
& .\Stop-QA.ps1 -ManifestPath 'C:\QA\paquete\runs\runtime-<timestamp-nuevo>\processes.json'
```

Reemplazar placeholder; no reutilizar manifest antiguo. Stop exige path normalizado bajo runs de ese mismo paquete, owner/packageRoot, fecha de inicio exacta, executable, commandline exacta y argumentos. Verifica todos antes de la primera detención y vuelve a verificar fecha antes de Stop-Process. No mata por nombre ni usa PIDs históricos. No detiene PG automáticamente.

**Cierre manual guardado de PG**, receta reconstruida sin ejecutar en esta entrega: usar las variables ID/name/runId recién capturadas, nunca seleccionar por nombre genérico. La inspección completa se mantiene en memoria; no imprimir Config.Env.

```powershell
$taskPgRecords = @(& docker inspect $taskPgContainerId | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $taskPgRecords.Count -ne 1) { throw 'No se pudo verificar PG propio.' }
$taskPg = $taskPgRecords[0]
$taskBindings = @($taskPg.HostConfig.PortBindings.'5432/tcp')
if ($taskPg.Id -ne $taskPgContainerId -or $taskPg.Name -ne ('/' + $taskPgName) -or $taskPg.Config.Labels.'top.portable.qa.run' -ne $taskPgRunId -or $taskPg.Config.Image -ne 'postgres:16-alpine' -or -not $taskPg.HostConfig.AutoRemove -or $taskPg.HostConfig.Tmpfs.'/var/lib/postgresql/data' -ne 'rw,size=512m' -or @($taskPg.Mounts).Count -ne 0 -or $taskBindings.Count -ne 1 -or $taskBindings[0].HostIp -ne '127.0.0.1' -or $taskBindings[0].HostPort -ne '55473' -or -not $taskPg.State.Running) { throw 'Guardas PG no coinciden; no detener.' }
$taskIdentity = (& docker exec $taskPgContainerId psql -U top_night_test -d top_test -tAc "SELECT current_database() || '|' || current_user;" | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $taskIdentity -ne 'top_test|top_night_test') { throw 'Identidad SQL inesperada; no detener.' }
$taskOtherClients = (& docker exec $taskPgContainerId psql -U top_night_test -d top_test -tAc "SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid();" | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $taskOtherClients -ne '0') { throw 'Hay otros clientes/no se pudo verificar; no detener.' }
& docker stop $taskPgContainerId
if ($LASTEXITCODE -ne 0) { throw 'Falló el cierre PG.' }
& docker ps -a --filter "id=$taskPgContainerId" --format '{{.ID}} {{.Names}}'
& docker ps -a --filter "name=$taskPgName" --format '{{.ID}} {{.Names}}'
Get-NetTCPConnection -LocalPort 3047,4177,55473 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
```

Verificar ausencia del contenedor propio y puertos libres. Si aparece otro ocupante, no detenerlo. No docker prune, compose down -v, borrar volúmenes ni taskkill global. --rm/tmpfs elimina solamente esta DB descartable y sus usuarios.

## Contenido y límites de verificación

Fuentes incluidas: Common.ps1, Set-QAEnvironment.ps1, Run-BackendGates.ps1, Seed-QAFixtures.ps1, Seed-QAFixtures.cjs, Check-QADatabase.cjs, Start-QA.ps1 y Stop-QA.ps1. `package-manifest.json` enumera hashes y `syntax-verification.json` y `windows-powershell-syntax.json` registran únicamente análisis de PowerShell 7/Windows PowerShell 5.1/node --check, sin ejecución de los scripts. No se incluyen .env, credenciales reales, node_modules, raws/logs históricos, fixtures JSON históricos ni launcher privado. Los valores sintéticos se incluyen deliberadamente para que la receta sea reproducible.

El smoke nuevo se ejecutó con Node24.19.0/PowerShell7.6.5 y Docker. La ejecución del paquete en Node22/PowerShell5.1 permanece pendiente. Ejecutar esta receta autorizadamente y preservar los manifests/resultados nuevos antes de atribuirle PASS. El frontend/adaptación puede requerir ajustar permisos locales de Docker; la lectura inicial sandbox de Docker fue inaccesible; la ejecución posterior autorizada funcionó, sin instalaciones.

## Validación posterior del paquete — 2026-10-01

Smoke con bootstrap normal ejecutado entre 2026-10-01T13:26:46.7709064Z y 2026-10-01T13:27:54.9700346Z, Node 24.19.0/PowerShell 7.6.5, PG nuevo sintético y app HEAD 9c2e8e6cffd36024881c8be6720f132bbd8d7cc4. Seis HTTP200 reales (health/UI/login/perfil/siete Bookings/dos Resources), assertions y cierre de API/frontend/PG propios PASS; 3047/4177/55473 libres. No se repitieron las suites completas ni se instaló nada. Backend55a2290/frontend94633656 limpios e idénticos.

El primer intento falló por readiness. El segundo realizó los controles funcionales y cleanup, pero el recolector falló al escribir result.json por archivo ocupado; ambos resultados originales se preservan. Se distinguen functionalSmokeStatus=PASS y reportingStatus=FAILED_FILE_OCCUPIED_ORIGINAL_PRESERVED. No declarar que el runner completo pasó sin errores. No se repitió el smoke por el fallo del recolector.

Start-QA usa ReadyTimeoutSeconds=180, rango10..300 y detección de salida propia; solo cambió soporte. La causa del primer timeout no quedó probada. Node22/PowerShell5.1 runtime y un recorrido nuevo de navegador siguen pendientes. La API normal puede escuchar fuera de loopback; rigen la máquina QA dedicada y red restringida del README.

Evidencia y proceso públicos en https://github.com/Manuetg/TOP-Platform/blob/codex/night-integration-20261001/docs/16-Portable-QA-Startup.md; PR101 conserva CI por head exacto.
