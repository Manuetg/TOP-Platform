# TOP — Actualización del arranque QA portable

## Validación posterior del paquete — 2026-10-01

Smoke con bootstrap normal ejecutado entre 2026-10-01T13:26:46.7709064Z y 2026-10-01T13:27:54.9700346Z, Node 24.19.0/PowerShell 7.6.5, PG nuevo sintético y app HEAD 9c2e8e6cffd36024881c8be6720f132bbd8d7cc4. Seis HTTP200 reales (health/UI/login/perfil/siete Bookings/dos Resources), assertions y cierre de API/frontend/PG propios PASS; 3047/4177/55473 libres. No se repitieron las suites completas ni se instaló nada. Backend55a2290/frontend94633656 limpios e idénticos.

El primer intento falló por readiness. El segundo realizó los controles funcionales y cleanup, pero el recolector falló al escribir result.json por archivo ocupado; ambos resultados originales se preservan. Se distinguen functionalSmokeStatus=PASS y reportingStatus=FAILED_FILE_OCCUPIED_ORIGINAL_PRESERVED. No declarar que el runner completo pasó sin errores. No se repitió el smoke por el fallo del recolector.

Start-QA usa ReadyTimeoutSeconds=180, rango10..300 y detección de salida propia; solo cambió soporte. La causa del primer timeout no quedó probada. Node22/PowerShell5.1 runtime y un recorrido nuevo de navegador siguen pendientes. La API normal puede escuchar fuera de loopback; rigen la máquina QA dedicada y red restringida del README.

Evidencia y proceso públicos en https://github.com/Manuetg/TOP-Platform/blob/codex/night-integration-20261001/docs/16-Portable-QA-Startup.md; PR101 conserva CI por head exacto.

[Detalle del smoke y comandos](16-Portable-QA-Startup.md).

---

## Snapshot documental anterior — preparación/publicación hasta 12:48 UTC

# TOP — Refinamiento nocturno: proceso, alcance y guía de revisión

Encargo TOP-Platform. La revisión documental precedió a la implementación aislada. La PR [#101](https://github.com/Manuetg/TOP-Platform/pull/101) está publicada como Draft hacia develop por autorización de las 12:06 UTC; sin aprobación, reviewers, merge/auto-merge ni deploy.

La [receta portable](../scripts/qa/README.md) y sus scripts se incorporan como soporte: requieren copiarse a una carpeta externa al clon QA, no incluyen el harness privado y solo tienen validación sintáctica. No hay smoke nuevo. La API normal no fija loopback; consultar esa limitación en la receta antes de arrancar. La QA histórica y CI verificado se identifican por su head y no sustituyen ese smoke.

# TOP-Platform — Informe detallado y guía de pruebas para Rolo

Actualización: 2026-10-01T12:48:54.431Z. Proyecto Manuetg/TOP-Platform. Base develop 835b2a4397bb3e6f04480386e62b11c86a74e8a5; rama codex/night-integration-20261001.

PR DRAFT publicada: https://github.com/Manuetg/TOP-Platform/pull/101. Publicación autorizada el 01/10/2026 a las 12:06 UTC. Sin reviewers, aprobación, merge/auto-merge ni despliegue. El código de aplicación sigue congelado en ee038ce9e94b8f8c7d0b61f9f5cd4fc61f8b9d9c; árbol backend 55a2290d933a810bd1c60249738d6c204a5d2df6 y frontend 94633656e5d5010c24c75300171377aa4aca75e7.

CI remoto verificado el 2026-10-01T12:27:21Z sobre head 6e572c1887391aca9c99dafbbee6caf2e997146d: frontend SUCCESS, 106 archivos/867 pruebas; backend SUCCESS, 128/1464 unitarias, 34/199 integración, 25/397 E2E, 196 escenarios/777 pasos, cobertura 187/2060 y arquitectura 0 violaciones. Node 22.23.3/npm 10.9.9. Mutation SKIPPED porque pull_request no activa ese job; no es PASS. El checkout sintético 87045746b28feba1bcd6c189d14429658e2ab25c tiene árbol completo idéntico al head publicado.

Frontend: https://github.com/Manuetg/TOP-Platform/actions/runs/36861110999
Backend: https://github.com/Manuetg/TOP-Platform/actions/runs/36861110824

El soporte QA se incorpora a la misma rama como documentación/scripts; cualquier nuevo head requiere su propio CI. Los resultados anteriores tienen el head indicado y no se heredan. El estado vivo de la PR es la fuente para el CI posterior a este corte documental.

La nueva receta portable es el capítulo 1: rutas parametrizadas y bootstrap normal, sin harness privado. Solo se analizó sintaxis; no se arrancaron servicios, sembraron datos ni repitieron suites con el paquete. Se recomienda un clon QA dedicado. Los capítulos históricos posteriores conservan comandos dependientes del entorno original y no son el launcher portable. No reinterpretar sus estados “local/sin push/CI22 NOT RUN” como el estado actual de la PR. La infraestructura sintética anterior fue cerrada y eliminada.

El nombre personal se edita con motivo y versión; el correo permanece informativo hasta definir su contrato seguro. Los siete estados de Booking y sus historias/transiciones se conservan. La página de cookies describe la implementación técnica; no afirma cumplimiento legal. No hay smoke nuevo del paquete ni certificación touch/WCAG, SMTP/S3 o finanzas reales.

Se entregan TXT y HTML con las cinco capturas existentes. DOCX/PDF fueron cancelados por instrucción del padre al no existir la habilidad requerida.

Proceso de publicación: se verificó develop y la ausencia de rama/PR previa, se conservó el checkout aislado y se hizo push normal sin force. El intento de crear la PR mediante la app integrada devolvió HTTP 403 “Resource not accessible by integration”; no creó ninguna PR. Antes del fallback se verificó la cuenta CLI ya autenticada rolandobarros27 y sus permisos pull/push/triage en Manuetg/TOP-Platform, sin modificar credenciales ni permisos, y se volvió a consultar la ausencia de PR. gh existente creó únicamente el Draft #101 hacia develop, sin reviewers ni auto-merge. El CI se leyó de los runs asociados al head exacto y su checkout sintético; no se reejecutó ni aprobó nada.

# Capítulo 1 — Receta QA portable

# QA local portable de TOP para Windows PowerShell

Paquete de soporte externo a la aplicación, preparado a partir de scripts QA existentes. **Solo se verificó sintaxis; no se ejecutó un smoke nuevo, instalación, PostgreSQL, aplicación, seed ni suites con este paquete.** No incluye harness privado: arranca el bootstrap normal `backend/dist/src/main.js` en `NODE_ENV=development`, con base/correo/secrets sintéticos y storage en memoria. El recorrido interactivo con API real que consta en el informe anterior usó otro launcher/harness; ese PASS no valida esta adaptación portable.

Usar un clon dedicado limpio de TOP-Platform y extraer este paquete en una carpeta externa al clon. Requiere Windows PowerShell 5.1 o PowerShell 7, Git, Node compatible, npm CLI local, Docker operativo con contenedores Linux y la imagen `postgres:16-alpine` disponible. README/CI oficiales del backend usan Node 22. La evidencia local anterior usa Node 24.19.0/npm 9.8.1 y no acredita CI22. No modifica Git global ni elimina archivos env. Se rechazan archivos env del clon para evitar consumir configuración ajena.

El corte documental local es `c9da5f2f48446666f9f68293463eaafc02d32aed`; código QA `ee038ce9e94b8f8c7d0b61f9f5cd4fc61f8b9d9c`; árbol backend `55a2290d933a810bd1c60249738d6c204a5d2df6`. La implementación está publicada en PR #101 Draft; el HEAD publicado 6e registra CI oficial Node 22 SUCCESS: Backend run 36861110824 y Frontend run 36861110999. Los árboles backend 55a2290d933a810bd1c60249738d6c204a5d2df6 y frontend 94633656e5d5010c24c75300171377aa4aca75e7 permanecen idénticos. Incorporar la rama de PR #101 en el clon dedicado y verificar el HEAD/árbol elegido antes de ejecutar. Esa CI valida el código publicado, no este paquete portable, que sigue sin smoke nuevo. No ejecutar contra el checkout principal, bases existentes ni recursos de otra sesión.

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

Para frontend dev, en otra sesión exclusiva cerrando primero la anterior: añadir `-DevelopmentFrontend`. API `http://127.0.0.1:3047/api`; health `/api/health`; frontend `http://127.0.0.1:4177`. NODE_ENV=development solo para el arranque normal; DB sigue siendo test descartable, correo console/memoria. CORS exactos 127.0.0.1:4177 y localhost:4177. Build preview debe contener VITE_API_URL=http://127.0.0.1:3047/api, que ya establece Set-QAEnvironment. El launcher rechaza puertos ocupados y genera un manifest NUEVO en runs/runtime-<timestamp>/processes.json con PID/startTime/executable/commandLine/args. Si falla arranque puede haber procesos propios activos: usar ese manifest para cierre verificado; si no se pudo capturar metadata completa, inspeccionar manualmente y no desactivar guardas.

**Limitación del bootstrap normal actual:** app.listen usa PORT sin fijar interfaz; API puede escuchar en interfaces distintas de loopback. Se conserva la aplicación intacta. Usar una máquina local QA dedicada con red restringida; PG y Vite sí se publican en loopback. No presentar este paquete como hosting/producción ni como smoke HTTP aprobado. La readiness HTTP200 futura solo constata arranque, no sustituye suites ni QA manual.

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

La portabilidad runtime completa (Node22/PowerShell5.1/Docker/bootstrap normal) permanece sin smoke fresco. Ejecutar esta receta autorizadamente y preservar los manifests/resultados nuevos antes de atribuirle PASS. El frontend/adaptación puede requerir ajustar permisos locales de Docker; el daemon actual del entorno de preparación fue inaccesible, sin instalaciones ni escalaciones.


# Revisión estática del paquete

# Revisión independiente del paquete QA portable

Revisión estática cerrada el 2026-10-01, sobre el paquete final generado a las 12:43:47 UTC en `validation/detailed-report/portable-qa`. Resultado: **sin hallazgos de seguridad bloqueantes pendientes en ese snapshot para distribuir las fuentes como receta Windows sin validación funcional nueva**. No acredita smoke, portabilidad runtime ni cumplimiento legal. La ejecución futura necesita autorización, clon dedicado y recursos nuevos propios conforme al README.

## Evidencia y cobertura

Se leyeron completos los ocho scripts y README, y se revisaron los cambios finales, los dos registros de sintaxis y el manifest. Inventario final: 12 archivos regulares; sin enlaces, `.env`, `node_modules`, directorios `runs`, fixtures JSON existentes, raws/logs históricos ni credenciales reales. Los valores públicos de prueba y las cuentas `example.invalid` son deliberadamente sintéticos. No hay rutas personales `C:\Users\Sady`, checkout Integration ni dependencia del launcher privado en las fuentes distribuidas.

Se recalcularon SHA256 y tamaños de las 11 entradas del manifest: **11/11 coinciden**. El manifest no se incluye en su propia lista.

| Archivo | SHA256 verificado |
|---|---|
| package-manifest.json | `0fc45176aee8d4b49673d01798006a064b7ce00b476541f3a4ef8a6d113b74cf` |
| Common.ps1 | `f121956f907be8b1c04f406468b042a95f6a00c57ca7c9a268d5a4029e55a103` |
| Stop-QA.ps1 | `2e6b0055324c4a21f2fec470a25b2bd3379ca379e27a9f5f3dbb09c46bc47923` |

La revisión ejecutó únicamente lecturas, inventario y cálculo de hashes, y escribió este informe externo. No ejecutó scripts QA, Docker, servicios, instalaciones, tests, navegador ni cambios Git/GitHub/aplicación. No se revisaron nuevos estados remotos de CI: las referencias de CI del README corresponden al código publicado y están expresamente separadas de la evidencia de este paquete.

## Guardas verificadas en las fuentes

- `Common.ps1:9` normaliza `RepoRoot`, Node y npm CLI, comprueba estructura del clon y rechaza archivos env por existencia sin leerlos ni borrarlos. `Common.ps1:25` limpia variables del proceso relevantes y fija DB/actor/puertos/secretos sintéticos, correo console y API URL QA. Las instrucciones requieren shell dedicada.
- `Common.ps1:55` exige ID PG completo, runId/nombre únicos, label exacto, imagen, AutoRemove, tmpfs exacto, cero mounts, binding loopback 55473, estado running/healthy, identidad SQL `top_test|top_night_test` y cero otros `client backend` en **todo el servidor**. Gates, seed y start requieren esos tres parámetros PG y llaman esta guarda antes de operar (`Run-BackendGates.ps1:15`, `Seed-QAFixtures.ps1:15`, `Start-QA.ps1:16`).
- Gates usan `migrate deploy`, registran comandos/exit codes y fallan al primer error; consultan Git y verifican HEAD/árbol backend estables. No hay comandos que hagan checkout, merge, commit, push, clean/reset ni cambios de configuración Git. No seleccionan ni modifican develop.
- El seed conserva guardas de URL/actor/test/env/SMTP/S3, comprueba cliente y columna migrados, y utiliza upserts con `update: {}` de fixtures sintéticos. No contiene reset ni DELETE. El indicador `GatesTerminados` expresa la decisión del operador; no se presenta como prueba automática de que los gates ya pasaron.
- `Start-QA.ps1:17` ejecuta el bootstrap normal `dist/src/main.js`; no hay harness privado. Rechaza puertos ocupados, deriva paths del clon y registra nueva sesión con PID, inicio UTC, executable y commandline/args. Usa ventana oculta y outputs de esa nueva sesión. La readiness HTTP200 futura se distingue de tests y QA funcional.
- `Stop-QA.ps1:3` restringe manifest a `runs` del paquete y comprueba owner/packageRoot. Deriva los argumentos esperados de RepoRoot/rol/modo y valida PID, fecha exacta, executable y commandline. Comprueba todos los procesos antes del primer cierre y vuelve a comprobar inicio antes de cada `Stop-Process -Id`; no mata por nombre ni árboles/globalmente. La ruta única de API se tipa `[string[]]` (`Stop-QA.ps1:16`).
- PG **no tiene cierre automático**. La receta manual (`README.md:100`) vuelve a comprobar ID/nombre/label/topología/actor/DB y ausencia de otros clientes en todo el servidor antes de `docker stop` del ID propio. No hay prune, borrado de volúmenes ni cierre de ocupantes ajenos.

## Hallazgos preliminares resueltos

El paquete WIP carecía de la precondición de ownership PG en gates/seed/start y de comparación de argumentos Stop contra el rol/RepoRoot. Ambos controles existen en el snapshot final. También quedaron corregidos el conteo de clientes limitado a una DB, la conversión de fechas JSON, el binding explícito de argumentos Node y el posible scalar de la ruta API en Stop. No quedan esos hallazgos abiertos.

## Límites pendientes de ejecución

Los registros aportados declaran parse PASS de los seis PS1 en PowerShell 7.6.5 y Windows PowerShell 5.1.26100.9549; `node --check` PASS de los dos CJS con Node 24.19.0 y un stub de binding de dos argumentos. Son comprobaciones de sintaxis/binding del autor, no pruebas de los servicios ni de sus guardas con recursos reales. Los propios registros declaran `freshSmokeExecuted: false`, `applicationTestsExecuted: false`, `servicesStarted: false`.

**Pendientes:** reproducción autorizada desde clon limpio con Node 22, Docker, PostgreSQL nuevo, gates/seed, bootstrap normal, QA funcional y cierre completo usando manifests nuevos. El API normal puede escuchar fuera de loopback porque el bootstrap actual no fija interfaz; `README.md:88` lo declara y exige máquina QA dedicada/red restringida. PG y Vite sí se configuran loopback. No se afirma portabilidad Linux ni PASS funcional fresco, y los PASS históricos/CI del código no validan este launcher.

La copia que se distribuya debe preservar estas fuentes y hashes, incluir ambos registros de sintaxis y mantener ignoradas las futuras salidas `runs`/`qa-fixtures.json`. Cualquier cambio posterior al snapshot requiere revisar su delta y actualizar manifest/evidencia; este cierre no autoriza despliegue ni merge.


---

# Capítulo histórico 2 — evidence-notes.md

Fuente fechada anterior a la publicación; hechos y comandos se conservan como evidencia, no como receta portable.

# Notas de evidencia para el informe detallado de TOP

Fecha: 1 de octubre de 2026. Estas notas están fuera del repositorio de aplicación y se prepararon por lectura de Git, fuentes y evidencia ya existente. No se ejecutaron pruebas, navegador, llamadas HTTP, migraciones ni servicios nuevos en esta auditoría; no se editaron archivos de aplicación. Las ejecuciones citadas pertenecen al integrador y a los agentes de QA anteriores.

## Procedencia y estado del trabajo

| Dato | Valor verificado |
|---|---|
| Proyecto | Manuetg/TOP-Platform |
| Integration | `C:/Users/Sady/Documents/Codex/2026-09-30/task-2/TOP-Integration` |
| Rama local | `codex/night-integration-20261001` |
| Base | `835b2a4397bb3e6f04480386e62b11c86a74e8a5` |
| HEAD de código | `ee038ce9e94b8f8c7d0b61f9f5cd4fc61f8b9d9c` |
| HEAD de entrega/documentación | `c9da5f2f48446666f9f68293463eaafc02d32aed` |
| Árbol backend en ambos HEAD finales | `55a2290d933a810bd1c60249738d6c204a5d2df6` |
| Árbol frontend en ambos HEAD finales | `94633656e5d5010c24c75300171377aa4aca75e7` |
| Commits locales sobre la base | 15: 14 de código/pruebas y uno final de documentación |
| Delta final c9da5f2 respecto de ee038ce | Solo 7 documentos: +115/-7 líneas; sin cambios backend/frontend |

Git en Integration muestra el HEAD final y checkout limpio. El último cierre registrado en [parent-delivery.json](../parent-delivery.json) es del 01/10/2026 07:25:38 UTC: main e Integration limpios, develop remoto aún en la base, árboles de aplicación sin cambios, runtime propio cerrado. Se trata de evidencia fechada; esta auditoría no realizó una consulta remota nueva. [delivery.json](../delivery.json) distingue código y documentación, detalla commits, árboles, gates y paquete.

PR #98 y #100 ya eran baseline: arranque/configuración de producción y sidebar/detalle de recursos/agenda/showcase, respectivamente. No atribuir esos trabajos completos a este refinamiento. No hubo push, aprobación de PR, merge ni despliegue de estos 15 commits locales. Los refinamientos permanecen **In Progress local**; no declarar Completed ni Production Ready. Fuente vigente: [Current Status](../../TOP-Integration/docs/00-Current-Status.md), primeras secciones.

## Métricas exactas del diff

Calculadas mediante `git diff --stat/--numstat/--name-status 835b2a4 c9da5f2`, sin modificar Git: **93 archivos, +6016/-1313 líneas; 28 añadidos y 65 modificados; ningún archivo eliminado**. Son líneas del diff, no una medida de funcionalidades completadas. Backend 21 archivos, frontend 65 y docs 7.

| Grupo por ruta | Archivos | Añadidas | Eliminadas |
|---|---:|---:|---:|
| backend | 21 | 1373 | 7 |
| docs | 7 | 124 | 4 |
| frontend/app | 6 | 122 | 10 |
| frontend/auth | 6 | 169 | 16 |
| frontend/availability | 1 | 3 | 12 |
| frontend/bookings | 11 | 905 | 195 |
| frontend/business | 4 | 134 | 23 |
| frontend/dashboard | 6 | 22 | 14 |
| frontend/marketing | 2 | 26 | 2 |
| frontend/payments | 5 | 594 | 74 |
| frontend/privacy | 4 | 216 | 0 |
| frontend/profile | 6 | 640 | 0 |
| frontend/resources | 12 | 1669 | 953 |
| frontend/search | 2 | 19 | 3 |
| **Total** | **93** | **6016** | **1313** |

Clasificación por nombre/ruta: **34 archivos de pruebas o soporte de pruebas** (`.spec.`, `.test.` o `backend/test/`), +4122/-131; **59 restantes**, +1894/-1182. El helper de limpieza de tests está incluido en los 34. No equiparar esta clasificación con cantidad de tests ni llamar a los 59 exclusivamente archivos productivos, porque incluyen documentación y migración.

El delta documental completo desde la base es +124/-4; el commit documental final aislado es +115/-7. Difieren porque Current Status ya había recibido cambios en commits anteriores.

## Antes y después por módulo

| Módulo/área | Situación previa observable | Resultado final y fuentes |
|---|---|---|
| Shell y cuenta | Configuración estaba detrás del Boundary global de Business, la identidad visible usaba el email y el selector navegaba siempre a Inicio. | Settings mantiene la cuenta disponible con Business vacío/error/cambio; el shell muestra nombre con fallback a email y acceso a cuenta/cookies. Key de cuenta por usuario y de pantallas operativas por usuario/Business. `frontend/src/app/layout/AppLayout.tsx:141,164,183`; AppShell.tsx; AppLayout.test.tsx. |
| Auth/session/storage | Un refresh en curso reconstruía la sesión con el usuario capturado antes de la solicitud; no existía el callback de guardado de perfil personal. | Refresh toma usuario/membresías más recientes; deduplicación por refreshToken. `updateUserProfile` acepta solo identidad/generación vigentes y preserva SESSION/LOCAL. Nueva sesión, incluso del mismo usuario, y logout invalidan callbacks anteriores. `frontend/src/features/auth/context/AuthContext.tsx:17,73,83,86`; storage valida `displayName` opcional. |
| Perfil personal backend | El nombre ya formaba parte del modelo User, pero faltaban los endpoints de perfil y el historial específico para este cambio. | GET/PATCH propio ACTIVE, nombre/motivo/versión; actor autenticado, bloqueo de fila y auditoría atómica. Migración aditiva `UserDisplayNameAudit`; no cambia el flujo legacy de email. Fuentes detalladas abajo. |
| Perfil personal frontend | Configuración editaba datos del establecimiento; no ofrecía este formulario personal auditado. | “Tu cuenta” permite nombre con motivo y versión, guardar/descartar, recuperar lectura y resolver 409 consultando primero la versión actual. Email visible de lectura. Actualiza nombre en navegación, caché y almacenamiento solo si la generación de sesión acepta la respuesta. `frontend/src/features/profile/components/PersonalProfile.tsx:49,56,65,72,84,86,96`; API y query en features/profile. |
| Business | La pantalla trataba solo “Tu establecimiento”; permisos ya dependían del rol. | “Configuración” separa cuenta del Boundary interno de Business. OWNER/ADMIN editan Business; otros roles consultan. Un formulario dirty no se reemplaza por un refetch, un formulario limpio se sincroniza; 403/404 bloquean y ofrecen actualizar acceso. Cancela lecturas anteriores antes de aplicar una escritura. `frontend/src/features/business/pages/BusinessProfilePage.tsx`. |
| Booking/estados | Etiquetas duplicadas y diferencias como “En estadía”, “No presentada” o “Completadas”; consumidores definían mapas propios. | Un catálogo comparte las siete etiquetas entre lista, detalle, timeline, Calendar, Dashboard, pagos, recursos y búsqueda. Códigos y lifecycle backend conservados. `frontend/src/features/bookings/booking-status.ts`; consumidores del inventario. |
| Booking/interacciones y rutas | Acciones mutables y rutas Edit/Confirm podían alcanzar hooks/formularios con contexto o rol inválidos; bloqueo reactivo permitía la ventana de doble envío. | VIEWER no ofrece mutaciones ni accede a Edit/Confirm por URL directa. Guards verifican sesión/token/Business/rol antes de montar contenido; key incorpora rol. Submit/Cancel usan un bloqueo síncrono compartido. Confirm aborta operaciones previas y descarta respuestas sin vida/presencia/operación vigentes; Edit descarta navegación tardía. `BookingDetailPage.tsx:108,197,211`; `EditBookingPage.tsx:36,50,243`; `ConfirmBookingPage.tsx:42,53,177,243`. |
| Booking/listado | El selector Estado podía desmontarse durante carga/error; filtros HTTP eran eliminados por el pipe; el layout tablet recortaba controles y badge. | Selector montado y foco conservado, BKG-003 corregido y CSS por ancho útil. Filtros de dos columnas a <=960 px de container, tarjetas existentes a <=900 px; móvil conserva una columna. `BookingListPage.tsx`, `.test.tsx`, `.css:4,405,416,427`; DTO backend. |
| Payments | Modales propios carecían del aislamiento/foco común; los guards de edición/cobro necesitaban endurecerse; búsqueda sin coincidencias se mostraba como si no hubiese reservas. | Permisos y exclusión síncrona entre registro de pago, plan y reprogramación; modales con OverlayPanel, fondo aislado, foco y Escape. PaymentHub separa “Sin coincidencias” de vacío real, agrega limpiar con foco y búsqueda por etiqueta. `BookingPaymentsPage.tsx:131,133,471,514,582,1761`; `PaymentHubPage.tsx:21,42`. Las reglas financieras backend no fueron rediseñadas. |
| Resource/detalle | Existía el detalle de PR #100; roles no acotaban todos los controles, nombres/fotos/estados requerían estados y jerarquía más claros. | Nombre, descripción, capacidad total/niños y código visibles; estado con Badge; acciones operativas según rol/estado. OWNER/ADMIN gestionan estado/fotos/amenidades; RECEPTIONIST opera reservas/bloqueos y VIEWER consulta. ARCHIVED conserva lectura/agenda. Galería separa carga/error/vacío, 0/1/10 fotos y fallo de imagen con reintento. Guards y refs bloquean duplicados/descartan resultados tardíos; revisión de modal evita que una respuesta vieja cierre una edición nueva. `ResourceDetailPage.tsx:71,173,319,446,527,611,810`. |
| Resource/editar | Refetch reseteaba todo el formulario y una respuesta tardía podía actualizar/navegar después del cierre o cambio de contexto. | Guard OWNER/ADMIN, key por usuario/Business/recurso/rol, AbortSignal y vida/presencia/scope/operación. `reset(...,{keepDirtyValues:true})` conserva nombre/descripción dirty y actualiza código limpio; cierre aborta y respuestas antiguas se descartan. `EditResourcePage.tsx:37,53,127,140,149,225`; `api/update-resource.ts`. |
| Resource/amenidades | Edición no recibía permiso explícito ni un token de operación para descartar efectos tras cambio de contexto. | `canManage`, remount por Business/recurso, bloqueo síncrono y comprobación de mounted/permission/operation; foco al abrir/cerrar y error/retry. `ResourceAmenitiesEditor.tsx`. No afirmar que todas las solicitudes de amenities se abortan: se descartan resultados fuera de contexto. |
| Resource/agenda | Calendario mensual previo agregaba movimientos y etiquetas locales; su presentación podía sugerir ocupación/disponibilidad. | Agenda de reservas y bloqueos con día seleccionado, enlaces a movimientos, teclado por flechas/Home/End y retry. Conserva timezone de Business, intervalos semiabiertos y códigos efectivos Block; remount por Business/recurso/timezone. Explica que Availability es la consulta autoritativa. `ResourceAvailabilityCalendar.tsx:43,66,91,114,185`. |
| Privacidad/web | Footer enviaba varios enlaces a `#top`, sin una política pública técnica de almacenamiento. | Ruta pública `/cookies`, enlaces útiles desde marketing/login/cuenta y anclas de preferencias/privacidad/pendientes legales. Inventario técnico fiel; no crea tracking o un banner de consentimiento. `CookiePolicyPage.tsx`, privacy/routes.tsx, appRoutes.tsx, SaasLaunchFooter.tsx, LoginPage.tsx. El mailto de marketing ya existía: estos cambios no verifican su operación ni la identidad del responsable. |
| Documentación | Handoffs mezclaban evidencias de distintos HEAD y decisiones históricas; la capacidad de perfil nuevo requería contrato explícito. | Siete docs reconciliados con fuentes/árboles/gates, contrato auditable de nombre y límites. Se preservan historia y decisiones pendientes; no se cambia el conteo del MVP por deducción. `docs/00,03,04,05,06,07,14`; verification JSON. |

### Catálogos y contratos conservados

| Código Booking | Etiqueta final |
|---|---|
| DRAFT | Borrador |
| PENDING | Pendiente |
| CONFIRMED | Confirmada |
| IN_PROGRESS | En curso |
| COMPLETED | Finalizada |
| CANCELLED | Cancelada |
| NO_SHOW | No show |

Fuente: [booking-status.ts](../../TOP-Integration/frontend/src/features/bookings/booking-status.ts). No se añadieron transiciones check-in/check-out ni una reescritura de estados persistidos. Block mantiene persistidos `SCHEDULED/CANCELLED` y efectivos `SCHEDULED/ACTIVE/FINISHED/CANCELLED`; Rate Plan sigue `ACTIVE/ARCHIVED`. Resource conserva su propio estado operativo. No mapear Block FINISHED a Booking COMPLETED.

La decisión previa de Manual libre para OWNER/ADMIN con cero/uno/varios Rate Plans sigue vigente, con `MANUAL_NO_RATE_PLAN`, motivo y snapshots históricos. RECEPTIONIST usa Configurada. Esta entrega no implementa un nuevo lifecycle ni una nueva regla de elegibilidad manual. Fuentes: contratos y `docs/03-Domain-Bible.md`, `04-Business-Rules.md`, `05-Architecture.md`, [documentation-map.md](../documentation-map.md).

### Contrato nuevo de nombre personal

- `GET /api/users/:id/profile` y `PATCH /api/users/:id/profile`: JWT autenticado, UUID válido, SELF y User ACTIVE; `Cache-Control: no-store`.
- PATCH contiene únicamente `{displayName, reason, expectedUpdatedAt}`. Nombre trim 1..120; motivo real trim no vacío; versión ISO UTC canónica con milisegundos exactos (`YYYY-MM-DDTHH:mm:ss.sssZ`). El actor viene de `principal.userId`, no del payload.
- Respuesta pública: `{id,email,displayName,status,updatedAt}`. `displayName` puede ser null en lectura histórica. No expone credenciales, sesiones, tokens ni auditoría.
- Errores de input 400, acceso SELF/ACTIVE 403, usuario inexistente 404, versión obsoleta 409; el guard de autenticación mantiene 401.
- `PrismaUserRepository.changeDisplayName` bloquea User con `FOR UPDATE`, revalida actor/estado/versión sobre el registro actual, y registra nombre anterior real nullable, nuevo, actor, instante y motivo en la misma transacción. Un fallo de auditoría revierte nombre y versión. Versión avanza al menos un milisegundo; no-op con versión vigente no escribe ni audita. Versión obsoleta falla antes de decidir no-op.
- La escritura toca `displayName/updatedAt`; conserva email/emailVerifiedAt, credencial, memberships y refresh sessions. Migración aditiva, dos FK RESTRICT y sin backfill. Limpiar base de tests borra auditoría antes de User.
- UI: 409 exige consultar nombre actual; solo después habilita descartar e iniciar con versión nueva. Mantiene motivo y borrador hasta la decisión del usuario. Cambio de Business desde Settings conserva nombre/motivo dirty.

Fuentes: `backend/src/modules/identity/application/{get-user-profile.use-case.ts,update-user-profile.use-case.ts}`, `infrastructure/prisma-user.repository.ts:37`, `presentation/user.controller.ts`, DTO request/response, `domain/user-profile-change.repository.ts`, `backend/prisma/schema.prisma` y `migrations/20261001000000_user_display_name_audit/migration.sql`. Tests de integración PostgreSQL en `backend/test/integration/prisma-user.repository.spec.ts:77,106,144,182,199,220,238,252,266,346` cubren historial, conservación, no-op, versión monótona, concurrencia, rollback, actor ajeno, DISABLED, deshabilitación concurrente y RESTRICT. Se leyeron, no se ejecutaron en esta auditoría.

## Bugs concretos y cierre verificable

| Hallazgo | Antes / mecanismo | Corrección / evidencia de cierre |
|---|---|---|
| R1, MEDIUM: borrador personal al elegir Business | `BusinessSelector.onSelected` navegaba siempre a `/app`, desmontaba PersonalProfile y perdía nombre/motivo. La key especial por sí sola no protegía ese recorrido del menú. | `d1a30a4` mantiene `/app/settings` y `/app/settings/`; conserva vuelta a Inicio para operaciones. Regresión con selector real en AppLayout.test.tsx; se integra en 867 tests y perfil/menú de QA real. Hallazgo y delta documentados en `integration-review.md`, R1. |
| BKG-003, HIGH funcional: filtros ignorados | Props del DTO tenían solo Swagger. `ValidationPipe({whitelist:true,transform:true})` eliminaba status/contactId/resourceId. API autenticada devolvía 200 y siete reservas también ante DRAFT o valor inválido. Scope Business seguía intacto. | `16c15b0` añade `@IsOptional()` a las tres props; no desactiva pipe ni reemplaza validadores de dominio. 21 regresiones adicionales en booking.e2e-spec.ts; suite focalizada 25/25. Luego 28/28 HTTP autenticados con AppModule/guards/PG: siete estados, intersecciones, inválidos/vacíos/repetidos 400, referencias cruzadas vacías y orden. Fuentes `booking-filter-contract/before-fix-http.json`, `post-fix-20261001T055933878Z/result.json`, DTO:5 y `integration-review.md`. |
| Lista Booking a 1024 px | En `a39c4fd`, Alojamiento sobresalía aprox.45 px del panel y tabla recortaba Estado/badge. 90 PASS automáticos comprobaban overflow global y no cerraban el hallazgo manual. | `ee038ce` modifica solo BookingListPage.css: container queries usan ancho útil tras sidebar y reutilizan tarjetas. Recaptura 1024 manual PASS: filtro x650..959 dentro panel x312..976; Pendiente x878.06..960 dentro card x312..976. Geometría final: 625 elementos, cero violaciones. Fuente final-preview-a39c4fd/aggregate.json y final-preview-ee038ce/aggregate.json. |
| Submit/Cancel duplicados y rol VIEWER | Guard de React podía actualizar estado después del segundo evento; acciones VIEWER requerían acotarse. | Refs síncronas y permisos; 24 transversales finales PASS, 9/9 regresiones originales cerradas. Submit/Cancel doble clic móvil/desktop: exactamente un POST por caso. Son endpoints mock; no demuestra idempotencia PostgreSQL. |
| Modal Payments/teclado | Modal propio no aislaba el fondo ni retenía/restauraba foco mediante componente compartido. | OverlayPanel compartido; pruebas de teclado/foco/Escape y reduced motion en 24 transversales mock. No certifica WCAG completa. |
| Búsqueda de pagos sin resultados | `rows.length===0` confundía búsqueda fallida con inventario sin reservas para cobrar. | Cuenta eligibleRows sin búsqueda; “Sin coincidencias”, limpiar y foco al input. Regresión móvil/desktop transversal y PaymentHubPage.test.tsx. |
| Resource refetch/cierre | Reset completo pisaba valores dirty; navegación/close/cache podían ejecutarse por respuesta fuera de contexto. | keepDirtyValues + key/AbortSignal/guard de operación; 3 suplementos dev preservan nombre/descripción y actualizan `internalCode` limpio a `QA-HAB-REMOTE`. 2 GET Resource 200 por caso; transporte mock y QueryClient real. Cierre abortado/foco cubierto por QA preview mock. |
| Perfil 409 sin salida útil | Tras consultar versión nueva, conflicto debía permitir descartar el borrador anterior. | `b9676aa` introduce freshConflict y habilita “Descartar nombre” después de lectura actual; descartar toma caché actual y limpia conflicto. PersonalProfile.integration.test.tsx y suite frontend final. |

El aviso fugaz “Solo las reservas pendientes pueden confirmarse” tras éxito figura como hallazgo histórico de una sesión anterior. No declarar una reproducción nueva en esta auditoría. Las guardas/abortos nuevos se pueden describir por su comportamiento y pruebas, sin convertir todo antecedente histórico en un hallazgo recién reproducido.

## Gates ejecutados previamente y alcance real

| Control | Resultado registrado | Fuente exacta y alcance |
|---|---|---|
| Backend, 12 gates | 12/12 PASS, exit 0, fuente estable | `validation/backend-setup/gates-20261001T054631671Z/results.json`; ejecutado sobre `a39c4fd`, backend tree `55a2290...` idéntico a ee038ce y c9da5f2. Es equivalencia de árbol, no una ejecución nueva en esos HEAD. |
| Prisma/DB | Generate, identidad DB, validate, migrate deploy PASS; 26 migraciones, 0 pendientes | Mismo directorio backend; PostgreSQL 16.15 desechable propio. |
| Backend build/lint | PASS | Mismo directorio. |
| Backend unit | 128 suites / 1464 tests PASS | unit.txt y summary.json. |
| Backend integración | 34 suites / 199 tests PASS | integration.txt y summary.json; PostgreSQL real de test, incluye concurrencia/rollback de perfil. |
| Backend E2E | 25 suites / 397 tests PASS | e2e.txt y summary.json. No todos usan DB: user-profile.e2e usa JWT/guards/use cases reales con repositories fake; booking.e2e usa pipe real, security:false y fake/spies. |
| Aceptación | 196 escenarios / 777 pasos PASS | acceptance.txt y summary.json; no equiparar BDD con navegador real. |
| Cobertura backend | 187 suites / 2060 tests PASS; statements 96.59%, branches 90.77%, functions 96.95%, lines 97.66% | coverage.txt/coverage-summary.json/summary.json. Repite los mismos 1464+199+397=2060 Jest; no sumarlos como tests distintos. |
| Arquitectura | 334 módulos / 761 dependencias; 0 violaciones | architecture.txt y summary.json. |
| Frontend | build/lint/test/integridad PASS, 106 archivos / 867 tests, 457.22 s | `validation/frontend-gates-20261001T061701790Z-d7a6d9d3/report.json`, test.log, lint.log; HEAD ee038ce, tree `94633656...`, SHA fuente antes/después `aceb39a5b290884cdf7fde4fd0c0c89f6de9e2ff56ccef875a1a4b53af329d01`. `--maxWorkers=1`. |
| Warning lint frontend | Un warning conservado: import `formatDashboardMonth` sin usar en DashboardHeader.tsx:6 | lint.log; exit 0. No afirmar “sin warnings” ni “warning corregido”. |
| HTTP BKG-003 | 28/28 PASS, Bookings sin cambios | `validation/booking-filter-contract/post-fix-20261001T055933878Z/result.json`; login ficticio real y solo GET de Booking, AppModule/configureApplication/guards/PG propios. Backend idéntico al final. |
| Revisión estática independiente | R1 y BKG-003 corregidos; delta CSS inspeccionado y evidencia externa de cierre consultada | `validation/integration-review.md`; autor solo leyó fuentes y evidencia ajena, no ejecutó gates/QA. No es aprobación PM/TL/PR. |
| Documentación | UTF8 válido, 0 replacement chars, 0 enlaces relativos rotos; diff check PASS | `validation/documentation-verification.json`, sobre las siete docs y fuentes congeladas. El commit c9da5f2 concreta el cierre documental que la revisión anterior aún nombraba pendiente. |

Node local **24.19.0**, backend npm **9.8.1**, frontend npm **10.2.0**. Workflow backend oficial usa Node **22**. CI Node22 no ejecutado para esta rama local. Mutation **NOT RUN** en este corte: el PASS de coverage no sustituye mutation. El workflow conserva mutation condicional a schedule/workflow_dispatch; SKIPPED de PRs anteriores no es PASS de esta entrega.

## Navegador: contar una vez y distinguir origen

**117 casos únicos PASS = 90 preview + 24 transversales + 3 suplementos dev**. Por origen: **6 públicos, 27 API/PG reales y 84 mocks**. Los 28 HTTP BKG-003 y las suites no se añaden a los 117.

- Preview final: `validation/visual-qa/runs/final-preview-ee038ce/results.json` y aggregate.json, **90 PASS, 0 FAIL, 3 SKIPPED** explícitos. 31 combinaciones de escenario/origen por tres viewports: 2 públicas, 9 reales y 20 mock, siendo una mock el refetch SKIPPED.
- QA real (9 escenarios × 3): Booking siete estados; perfil persistencia; recurso persistencia; recurso VIEWER; recurso VIEWER backend403; recurso RECEPTIONIST backend403; recurso cero fotos; settings OWNER y settings VIEWER. La comparación real de filtros prueba lectura, no lifecycle financiero.
- Preview mock: Loading/error de Booking; siete estados; fotos 0/1/10/error; resource VIEWER; edit/cierre abortado; modal de Resource y delete con foco; settings loading/error/owner/viewer/write403; login inválido. El refetch mock preview mantiene sus tres SKIPPED.
- Seis restauraciones PASS (perfil/recurso ×390/1024/1440): escrituras exclusivamente sintéticas, restauración mediante UI y GET posterior. La relectura final `backend-setup/final-db-restoration-ee038ce9.json` confirma nombres/campos de recursos restaurados, siete reservas sin cambios, cero fotos reales y cero otras conexiones de clientes. El historial auditable de los cambios sintéticos permanece; restaurar valores no significa eliminar auditoría.
- Geometría preview final: 87 puntos, 625 elementos visibles, cero violaciones; compara controles con panel y badges con tabla/card. Cero page errors, requests bloqueadas y mocks desconocidos. **27 consoleErrorCount** corresponden a fixtures previstos 401/403/500; registra cantidades, no contenidos. No presentar “cero errores de consola”.
- Transversales final: `validation/transversal-regression/runs/final-ee038ce-r2/results.json`, **24/24 PASS**, 9/9 regresiones originales PASS, freezePreserved:true. VIEWER/RECEPTIONIST, URL directa Edit/Confirm, doble clic Submit/Cancel, pagos vacío/búsqueda, foco Estado y modal/teclado/reduced motion. **Todos los endpoints API simulados**.
- Suplemento Vite dev: `validation/visual-qa/runs/final-dev-refetch-ee038ce-r3/results.json`, **3/3 PASS**, mismos scenario/source/width que los SKIPPED preview. 2 GET Resource 200 por ancho, nombre/descripción dirty preservados, código limpio exactamente `QA-HAB-REMOTE`; QueryClient real con transporte mock. No se reclasifica el preview como 93 PASS.

Headless **Edge 154.0.4258.37**, viewports emulados **390×844, 1024×900 y 1440×900**. Sin touch físico ni auditoría completa WCAG 2.2 AA. Los runners y árboles de aplicación permanecieron estables durante cada corrida; docs en edición durante la QA se confirmaron después sin cambiar aplicación.

### Antecedentes que deben permanecer como fallos o skips

| Corrida anterior | Estado y explicación | Tratamiento correcto |
|---|---|---|
| Backend `gates-20261001T053803149Z` /16c15b0 | 11/12 PASS, lint FAIL `no-unexpected-multiline` en it.each | a39c4fd solo corrige formato y ejecuta de nuevo los 12 gates. No convertir los 2060 tests previos en PASS global. |
| Frontend d1a30a4 | build/lint/test PASS, 106/867, árbol e26... anterior | Antecedente válido para su árbol. ee038ce cambia CSS y cuenta con corrida completa nueva. |
| QA parcial d1a30a4 | Cancelada con 38 observados: 22 PASS /16 FAIL | Problemas de runner (nulls guard y DOM oculto) más defecto real BKG-003. No sustituye el resultado final ni convertirla toda en bugs de aplicación. |
| Preview a39c4fd | 90 PASS /3 SKIPPED automáticos, **MANUAL_FAIL** a1024 | CSS ee038ce y nueva revisión manual/geométrica cierran el defecto. El archivo viejo conserva su FAIL. |
| Transversales a39c4fd-final-24 | 22 PASS /2 FAIL: locator “Pendiente” encontraba badge y resumen financiero | Runner final acota badge y repite 24 casos. Los intentos fallidos conservan su estado. |
| Dev ee038ce inicial | 3 FAIL antes de login/refetch: glob interceptaba módulos Vite que contienen `/api/` | Se restringe routing al origen/prefix API reales; no se cambia aplicación. |
| Dev ee038ce-r2 | 3 FAIL: selector de label no contemplaba hint de Código interno | r3 usa `input[name="internalCode"]`; conserva expectativa QA-HAB-REMOTE, dirty values, assertions y timeouts. |

Fuentes: Current Status e integration-review describen la procedencia de cada intento; los JSON originales siguen disponibles en validation. Los ajustes del runner no autorizan presentar los FAIL/SKIPPED antiguos como PASS.

## Pendientes y límites que afectan revisión o publicación

1. **Correo seguro**: PATCH IAM-005 legacy mantiene sesiones y `emailVerifiedAt`; token de verificación refiere User sin congelar email destino. Es un riesgo preexistente; la nueva UI presenta email de lectura. Definir nueva dirección/reverificación, vínculo/invalidez de tokens previos, reautenticación y política de sesiones antes de un flujo nuevo. Fuentes `update-user.use-case.ts:28`, `prisma-user.repository.ts:26`, `verify-email.use-case.ts:14`, Current Status y Architecture.
2. **Legal**: pendiente operador/responsable, contacto de privacidad/procedimiento, jurisdicción, proveedores/ubicaciones/tratamiento, retención y condiciones. `/cookies` es inventario técnico, no asesoramiento jurídico ni certificación de cumplimiento. No se encontraron cookies propias ni SDK tracking en código revisado; esto no prueba ausencia en hosting/producción.
3. **SMTP/S3**: la configuración segura de PR #98 está en baseline. Producción exige SMTP/S3; TLS465 o STARTTLS y certificados según backend README/Architecture. Esta QA usó correo console y memoria/fotos mock, sin conexión cloud. Fotos 1/10 prueban UI; no demuestran upload/persistencia S3. Ningún test de esta noche acredita entrega SMTP remota. Arrancar config no verifica servicios remotos.
4. **Finanzas**: Bookings reales sintéticas de siete estados son fixtures de lectura sin PricingSnapshot/Payment/PaymentPlan. Doble clic y operaciones financeiras del navegador son mock; no demostrar por ello idempotencia o persistencia financiera de producción. Las suites backend conservan su alcance propio.
5. **Entorno/revisión**: CI Node22, mutation, quality gate preproducción, restante de seguridad B y revisión humana pendientes. Un diff local probado no acredita despliegue productivo.
6. **Comercial**: `TOP Inicial /10 Resources` sigue provisional y FE-SUB-001 mantiene definición comercial pendiente. No declarar cierre final de MVP.
7. **Historia/documentación**: ADR001 anterior a Phase2; Block FINISHED vs COMPLETED histórico; Rate Plan ACTIVE/ARCHIVED; IDs BR repetidos; 50 filas frontend Completed frente al total declarado51; Inter provisional reemplazado por Brand Book/DESIGN. No renumerar ni reinterpretar historias en este informe.

Inventario técnico storage: acceso JWT en memoria; `top.auth.session.v1` en sessionStorage por defecto o localStorage opt-in con “Mantener sesión”; localStorage sin TTL propio, servidor controla validez, logout/restauración fallida elimina. Recuperación `top.auth.reset-grant.v1` sessionStorage; autorización servidor15min, se limpia al éxito y puede quedar tras abandono. Sidebar `top.sidebar.collapsed.v1` localStorage sin expiración. Fontsource local; WhatsApp sale a tercero por acción del usuario. Fuentes storage/AuthContext/AppShell y CookiePolicyPage.

## Cobertura documental: atribución correcta

[documentation-map.md](../documentation-map.md) contiene inventario de **32 Markdown propios y 11 contratos backend**. Esa lectura completa fue informada por el integrador anterior; esta auditoría verifica el mapa y los archivos relevantes, **no afirma haber releído íntegramente los 43 documentos**. El mapa contiene NOT RUN/pending de su etapa inicial; para el estado actual usar delivery, parent-delivery y los reports finales, sin borrar el contexto histórico.

Los once contratos: Availability, Block, Booking, Booking Lifecycle, Business, Contact, Identity, Payment, Pricing, Resource y Subscription en `backend/src/modules/<module>/*.contract.ts` (Lifecycle usa booking-confirmation.contract.ts). Jerarquía AGENTS: dominio/reglas > backlog/alcance > arquitectura > Brand Book > DESIGN > skills. Plus Jakarta Sans, Lucide regular, Bosque/arcilla y tokens compartidos permanecen. Esta entrega no autoriza cambiar reglas ni ampliar MVP.

## Entrega existente y huellas contrastadas

Patch local: [TOP-night-refinement-20261001.patch](../packages/combined/TOP-night-refinement-20261001.patch), **552809 bytes**, SHA-256 `f8e68319225ad301dc2d641bc56df038b3028b5f3bb2f0155b835fd33b08123b`; reverseApplyCheck PASS registrado. Informe HTML existente 830523 bytes, SHA `1f4c8c070ca4c0681a00d60457bdce4b7b70440621ca969b0baee88c9416c219`. ZIP existente 1337882 bytes, SHA `8a41bdc97f45521844eb223313f826c7b0e1f960f54a8bb95d5e60cc4508b971`. Archive verification 13 entradas PASS. Son la entrega previa; estas notas no la actualizan ni anuncian Library/publicación.

Get-FileHash confirmó las huellas de patch y de los tres reports de navegador con las del manifest. Otras huellas leídas/calculadas en esta auditoría:

| Archivo | Bytes | SHA-256 |
|---|---:|---|
| delivery.json |15792|`0bef55188f15d1a5b8036183f2045b8a2a8420fdac5327e5f9f7f76e24e35551`|
| parent-delivery.json |5204|`7dbe28cf4591c2f61ae401f9acf3fd13b2a096c5e0ab948b1f2178a227286ecb`|
| backend gates final/results.json |9107|`a580ede2abce425a6b9c61722d93006983127b482796831119e7beb6ced9c0f8`|
| frontend gates final/report.json |2929|`3017bd5ae032870b4974ea4258d5e48433878b6211361117f2a24c07bc6ab6e0`|
| preview final/results.json |949576|`d5f861fc3e328b3d4cab02042177ed300dac5a63f3cab3cf6fa9b673324f7338`|
| transversales final/results.json |78063|`44200197ecc7edd40acb758acc085d47529677293ae69e67f7eeba8b3eb00467`|
| suplemento dev final/results.json |15711|`2073d2e53aa2a26d230982dc21a4b7d55a60b858bfc05f9c1b8cb4db45a5efc0`|
| HTTP BKG-003 post-fix/result.json |23352|`c61e70cc20d25a440f297359db01dce37dfaf60ad0414b9d6585dee127aee8fd`|

## Inventario exacto de archivos y commits

Las siguientes tablas se obtienen directamente del diff numstat y log locales de base a entrega. Se agregan para permitir al autor del informe seleccionar anexos sin inventar paths o conteos.

### Archivos (+/- frente a base)

| Ruta | + | - |
|---|---:|---:|
| `backend/prisma/migrations/20261001000000_user_display_name_audit/migration.sql` | 16 | 0 |
| `backend/prisma/schema.prisma` | 16 | 0 |
| `backend/src/modules/booking/presentation/dto/list-bookings.request.dto.ts` | 7 | 1 |
| `backend/src/modules/identity/application/get-user-profile.use-case.ts` | 23 | 0 |
| `backend/src/modules/identity/application/update-user-profile.use-case.ts` | 32 | 0 |
| `backend/src/modules/identity/application/user-profile.errors.ts` | 2 | 0 |
| `backend/src/modules/identity/application/user-profile.use-cases.spec.ts` | 124 | 0 |
| `backend/src/modules/identity/domain/user-profile-change.repository.ts` | 19 | 0 |
| `backend/src/modules/identity/identity.module.spec.ts` | 7 | 0 |
| `backend/src/modules/identity/identity.module.ts` | 6 | 0 |
| `backend/src/modules/identity/infrastructure/prisma-user.repository.spec.ts` | 188 | 0 |
| `backend/src/modules/identity/infrastructure/prisma-user.repository.ts` | 21 | 1 |
| `backend/src/modules/identity/presentation/dto/update-user-profile.request.dto.ts` | 16 | 0 |
| `backend/src/modules/identity/presentation/dto/user-profile.response.dto.ts` | 15 | 0 |
| `backend/src/modules/identity/presentation/user-profile.controller.spec.ts` | 66 | 0 |
| `backend/src/modules/identity/presentation/user.controller.spec.ts` | 1 | 1 |
| `backend/src/modules/identity/presentation/user.controller.ts` | 45 | 2 |
| `backend/test/e2e/booking.e2e-spec.ts` | 64 | 2 |
| `backend/test/e2e/user-profile.e2e-spec.ts` | 414 | 0 |
| `backend/test/integration/prisma-user.repository.spec.ts` | 290 | 0 |
| `backend/test/integration/support/clean-test-database.ts` | 1 | 0 |
| `docs/00-Current-Status.md` | 56 | 2 |
| `docs/03-Domain-Bible.md` | 13 | 0 |
| `docs/04-Business-Rules.md` | 14 | 1 |
| `docs/05-Architecture.md` | 12 | 0 |
| `docs/06-Roadmap.md` | 4 | 0 |
| `docs/07-Backlog.md` | 8 | 0 |
| `docs/14-Frontend-Backlog.md` | 17 | 1 |
| `frontend/src/app/layout/AppLayout.test.tsx` | 71 | 2 |
| `frontend/src/app/layout/AppLayout.tsx` | 16 | 8 |
| `frontend/src/app/layout/AppShell.css` | 3 | 0 |
| `frontend/src/app/layout/AppShell.tsx` | 8 | 0 |
| `frontend/src/app/router/appRoutes.privacy.test.tsx` | 22 | 0 |
| `frontend/src/app/router/appRoutes.tsx` | 2 | 0 |
| `frontend/src/features/auth/context/AuthContext.test.tsx` | 125 | 4 |
| `frontend/src/features/auth/context/AuthContext.tsx` | 27 | 8 |
| `frontend/src/features/auth/pages/LoginPage.test.tsx` | 4 | 3 |
| `frontend/src/features/auth/pages/LoginPage.tsx` | 2 | 1 |
| `frontend/src/features/auth/storage/auth-session-storage.test.ts` | 10 | 0 |
| `frontend/src/features/auth/storage/auth-session-storage.ts` | 1 | 0 |
| `frontend/src/features/availability/pages/AvailabilityCalendarPage.tsx` | 3 | 12 |
| `frontend/src/features/bookings/booking-status.ts` | 32 | 0 |
| `frontend/src/features/bookings/components/BookingTimeline.tsx` | 1 | 1 |
| `frontend/src/features/bookings/pages/BookingDetailPage.tsx` | 23 | 22 |
| `frontend/src/features/bookings/pages/BookingListPage.css` | 87 | 59 |
| `frontend/src/features/bookings/pages/BookingListPage.test.tsx` | 143 | 0 |
| `frontend/src/features/bookings/pages/BookingListPage.tsx` | 30 | 92 |
| `frontend/src/features/bookings/pages/BookingRouteAccess.test.tsx` | 166 | 0 |
| `frontend/src/features/bookings/pages/BookingStates.integration.test.tsx` | 329 | 0 |
| `frontend/src/features/bookings/pages/ConfirmBookingPage.test.tsx` | 12 | 6 |
| `frontend/src/features/bookings/pages/ConfirmBookingPage.tsx` | 40 | 11 |
| `frontend/src/features/bookings/pages/EditBookingPage.tsx` | 42 | 4 |
| `frontend/src/features/business/components/Business.css` | 3 | 2 |
| `frontend/src/features/business/components/BusinessBoundary.tsx` | 3 | 3 |
| `frontend/src/features/business/components/BusinessManagement.integration.test.tsx` | 95 | 4 |
| `frontend/src/features/business/pages/BusinessProfilePage.tsx` | 33 | 14 |
| `frontend/src/features/dashboard/components/DashboardHospitalityIntelligence.test.tsx` | 5 | 0 |
| `frontend/src/features/dashboard/components/DashboardHospitalityIntelligence.tsx` | 2 | 1 |
| `frontend/src/features/dashboard/components/DashboardKpiStrip.test.tsx` | 4 | 0 |
| `frontend/src/features/dashboard/components/DashboardKpiStrip.tsx` | 2 | 1 |
| `frontend/src/features/dashboard/components/DashboardMetrics.tsx` | 2 | 10 |
| `frontend/src/features/dashboard/pages/DashboardPage.test.tsx` | 7 | 2 |
| `frontend/src/features/marketing/components/SaasLaunchFooter.tsx` | 16 | 2 |
| `frontend/src/features/marketing/pages/SaasLaunchShowcasePage.test.tsx` | 10 | 0 |
| `frontend/src/features/payments/pages/BookingPaymentsPage.test.tsx` | 333 | 0 |
| `frontend/src/features/payments/pages/BookingPaymentsPage.tsx` | 68 | 64 |
| `frontend/src/features/payments/pages/PaymentHubPage.test.tsx` | 158 | 0 |
| `frontend/src/features/payments/pages/PaymentHubPage.tsx` | 26 | 9 |
| `frontend/src/features/payments/pages/Payments.css` | 9 | 1 |
| `frontend/src/features/privacy/pages/CookiePolicyPage.css` | 42 | 0 |
| `frontend/src/features/privacy/pages/CookiePolicyPage.test.tsx` | 50 | 0 |
| `frontend/src/features/privacy/pages/CookiePolicyPage.tsx` | 114 | 0 |
| `frontend/src/features/privacy/routes.tsx` | 10 | 0 |
| `frontend/src/features/profile/api/user-profile.test.ts` | 183 | 0 |
| `frontend/src/features/profile/api/user-profile.ts` | 31 | 0 |
| `frontend/src/features/profile/components/PersonalProfile.css` | 13 | 0 |
| `frontend/src/features/profile/components/PersonalProfile.integration.test.tsx` | 297 | 0 |
| `frontend/src/features/profile/components/PersonalProfile.tsx` | 101 | 0 |
| `frontend/src/features/profile/queries/use-user-profile.ts` | 15 | 0 |
| `frontend/src/features/resources/api/update-resource.test.ts` | 18 | 0 |
| `frontend/src/features/resources/api/update-resource.ts` | 3 | 0 |
| `frontend/src/features/resources/components/ResourceAmenitiesEditor.test.tsx` | 286 | 26 |
| `frontend/src/features/resources/components/ResourceAmenitiesEditor.tsx` | 106 | 28 |
| `frontend/src/features/resources/components/ResourceAvailabilityCalendar.css` | 74 | 373 |
| `frontend/src/features/resources/components/ResourceAvailabilityCalendar.test.tsx` | 201 | 57 |
| `frontend/src/features/resources/components/ResourceAvailabilityCalendar.tsx` | 141 | 197 |
| `frontend/src/features/resources/pages/EditResourcePage.test.tsx` | 274 | 0 |
| `frontend/src/features/resources/pages/EditResourcePage.tsx` | 105 | 56 |
| `frontend/src/features/resources/pages/ResourceDetailPage.css` | 132 | 75 |
| `frontend/src/features/resources/pages/ResourceDetailPage.test.tsx` | 147 | 24 |
| `frontend/src/features/resources/pages/ResourceDetailPage.tsx` | 182 | 117 |
| `frontend/src/features/search/components/GlobalSearch.test.tsx` | 17 | 0 |
| `frontend/src/features/search/components/GlobalSearch.tsx` | 2 | 3 |

### Commits locales, orden de aplicación

| Commit | Asunto |
|---|---|
| `9d6a69e` | feat(auth): preserve personal profile across session refresh |
| `59482fa` | fix(resources): discard edits outside the active context |
| `1c6ae0d` | fix(resources): preserve dirty fields during refetch |
| `692564a` | feat(resources): refine details and monthly agenda |
| `a681ff4` | feat(privacy): document browser storage and cookie policy |
| `e1d4a7a` | feat(identity): audit personal name changes with optimistic versioning |
| `eab9872` | feat(bookings): unify state labels and harden interaction guards |
| `a91e1ee` | feat(app): expose account settings and public cookie information |
| `3acb8e8` | feat(settings): edit personal profile with safe session persistence |
| `b9676aa` | fix(profile): allow discarding a refreshed version conflict |
| `d1a30a4` | fix(app): guard booking routes and preserve account drafts |
| `16c15b0` | fix(bookings): preserve contractual query filters through validation |
| `a39c4fd` | test(bookings): keep query regression cases lint compliant |
| `ee038ce` | fix(bookings): adapt filters and states to available width |
| `c9da5f2` | docs: reconcile local refinement contracts and validation |


---

# Capítulo histórico 3 — backend-guide-notes.md

Fuente fechada anterior a la publicación; hechos y comandos se conservan como evidencia, no como receta portable.

# Notas verificadas de backend para el informe y la guía de Rolo

Documento de apoyo fuera del repositorio de aplicación. Inspección actual exclusivamente de lectura; no se instalaron dependencias, ejecutaron suites, sembraron usuarios, levantaron servicios ni modificó la aplicación durante esta revisión. El texto distingue comandos de scripts/logs existentes, instrucciones del proyecto y una reconstrucción pendiente de ejecución.

## Identidad del corte y alcance de la evidencia

- Proyecto: TOP-Platform. Checkout de integración: `TOP-Integration`, rama `codex/night-integration-20261001`.
- HEAD leído durante esta revisión: `c9da5f2f48446666f9f68293463eaafc02d32aed`.
- Fuente QA de aplicación: `ee038ce9e94b8f8c7d0b61f9f5cd4fc61f8b9d9c`.
- Árbol backend actual y del gate final: `55a2290d933a810bd1c60249738d6c204a5d2df6`.
- Los 12 gates backend se ejecutaron sobre `a39c4fd247ad5671d554684d316e94acdfb7a8ea`, entre 05:46:31 y 05:52:33 UTC del 01/10/2026. El árbol backend es idéntico al de ee038ce y al HEAD final documental; no se afirma que los 12 gates se hayan repetido en esos HEAD posteriores.
- La evidencia `qa-equivalence-ee038ce9.json` conserva igualdad de árbol, snapshot de 1707 archivos dist y sus hashes. El único cambio de aplicación entre a39c4fd y ee038ce fue CSS frontend.
- Runtime de la corrida: Node `24.19.0`, npm backend `9.8.1`. Ambos se comprobaron por lectura de sus ejecutables en esta revisión. README y CI oficial usan Node `22`; CI corre Ubuntu. No hay equivalencia de entornos ni CI Node 22 nuevo acreditados por la corrida Windows/Node 24.
- No se acredita production readiness, mutation, SMTP/S3 cloud ni validación jurídica. El harness usa AppModule/configureApplication, autenticación, guards, pipes y CORS reales, pero no sustituye el bootstrap HTTP por defecto `main.ts` ni un despliegue productivo.

Evidencia principal: `validation/backend-setup/gates-20261001T054631671Z/results.json`, `summary.json`, `REPORT.md`, logs y cobertura; `qa-equivalence-ee038ce9.json`; `cleanup-final-ee038ce9.json`.

## Estado de la sesión entregada

`cleanup-final-ee038ce9.json` registra `ALL_OWNED_RUNTIME_CLOSED` a las 07:07:50 UTC del 01/10/2026: API/frontend propios cerrados, PG propio detenido y autoeliminado, puertos 3047/4177/55473 libres y servicios ajenos sin cambios. Antes de eliminar PG se verificaron cuatro usuarios ACTIVE y verificados, dos negocios, cinco membresías, dos recursos, dos contactos, siete reservas y dos bloques, con nombres/recursos restaurados y reservas intactas.

PG usaba tmpfs y `--rm`: su base y los usuarios desaparecieron al cerrarlo. El JSON `qa-fixtures.json` es un manifest histórico, no una prueba de que hoy existan esos datos. Para repetir QA hay que recrear PG, migrar, terminar gates y volver a ejecutar el seed. Los manifests de procesos históricos tampoco autorizan detener PIDs de otra sesión.

La inspección Docker de esta revisión no pudo alcanzar el daemon: los comandos de lectura devolvieron `permission denied` al pipe `docker_engine`. No se escaló ni se levantó Docker. Por ello el cierre se atribuye a la evidencia preservada, y no a una inspección actual del daemon. `docker run --help` sí confirmó las opciones utilizadas en la reconstrucción de abajo.

## Directorio y herramientas de la receta Windows

Los comandos relativos de esta guía parten de:

```powershell
Set-Location -LiteralPath 'C:\Users\Sady\Documents\Codex\2026-09-30\task-2'
$taskNodeExecutable = 'C:\Users\Sady\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$taskNpmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$taskBackendRoot = Join-Path (Get-Location).Path 'TOP-Integration\backend'
$taskPrismaCli = Join-Path $taskBackendRoot 'node_modules\prisma\build\index.js'
```

Esas rutas están fijadas en los runners comprobados. `set-test-environment.ps1` antepone el directorio del Node reservado a PATH; el runner verifica también el Node que resolverán los shims npm. No basta con tener cualquier `node` en PATH. En otro equipo deben adaptarse los scripts externos y sus rutas/guardas coherentemente antes de ejecutar; no son utilidades portables sin ajustes. No modificar la aplicación para quitar guardas.

### 1. Dependencias

La instrucción oficial de `backend/README.md` y `.github/workflows/backend-ci.yml` es Node 22 y `npm ci` desde backend. CI además ejecuta Prisma generate y migrate deploy antes de las suites. El runner externo no instala ni descarga: requiere Node, npm CLI y Prisma CLI ya disponibles.

```powershell
Push-Location -LiteralPath '.\TOP-Integration\backend'
npm ci
Pop-Location
```

Es una instrucción documentada del proyecto; esta inspección no contiene una instalación nueva ni un log de `npm ci` ejecutado en esta entrega. Para conservar explícitamente el runtime local histórico, el equivalente de invocación es `& $taskNodeExecutable $taskNpmCli ci` en ese directorio, con el PATH del Node reservado; tampoco se ejecutó en esta revisión. No usar `npm install` como sustituto y no etiquetar esta instalación como gate ya aprobado.

Para el launcher conjunto también debe estar preparada la dependencia frontend `TOP-Integration/frontend/node_modules/vite/bin/vite.js`. Los detalles de instalación/build frontend corresponden a su propia guía. Docker debe estar operativo, con contenedores Linux y la imagen `postgres:16-alpine` ya disponible para usar `--pull never`. Si falta, este procedimiento se detiene; no descarga imágenes implícitamente.

### 2. PostgreSQL descartable propio

El comando literal histórico de creación no quedó archivado. Sí quedaron comprobados en `final-pg-preflight-ee038ce9.json`: nombre `top-night-integration-pg-20261001-835b2a4`, imagen `postgres:16-alpine`, owner `backlog_qa`, autoRemove=true, tmpfs de datos `rw,size=512m`, sin mounts, bind exclusivo `127.0.0.1:55473:5432` y estado healthy. La identidad SQL fue `top_test` / `top_night_test`.

La siguiente es una **reconstrucción para una nueva ejecución, no un comando ejecutado ni archivado de la entrega anterior**. La contraseña procede del script QA y está declarada sintética. El label con clave `owner` es una convención explícita para la sesión nueva: la evidencia antigua conserva el valor owner, pero no la clave original del label. La selección del health command también se explicita para la sesión nueva; no se atribuyen intervalos/reintentos antiguos que no fueron preservados.

Antes de crear: comprobar que nombre y puerto están libres. Si están ocupados, detener este procedimiento y revisar ownership; no reutilizar ni parar el recurso encontrado.

```powershell
$ErrorActionPreference = 'Stop'
$taskPgName = 'top-night-integration-pg-20261001-835b2a4'
$taskContainerNames = @(& docker ps -a --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Docker; no crear PostgreSQL.' }
if ($taskContainerNames -contains $taskPgName) { throw 'Nombre PG ocupado; no reutilizar ni eliminar otro contenedor.' }
$taskPgPortListeners = @(Get-NetTCPConnection -LocalPort 55473 -State Listen -ErrorAction SilentlyContinue)
if ($taskPgPortListeners.Count -ne 0) { throw 'Puerto 55473 ocupado; no tocar el proceso existente.' }
& docker image inspect postgres:16-alpine --format '{{.Id}}'
if ($LASTEXITCODE -ne 0) { throw 'Falta imagen local o acceso Docker; no descargar automáticamente.' }

$taskPgContainerId = (& docker run --pull never --detach --rm --name $taskPgName --label 'owner=backlog_qa' --tmpfs '/var/lib/postgresql/data:rw,size=512m' --publish '127.0.0.1:55473:5432' --env 'POSTGRES_USER=top_night_test' --env 'POSTGRES_PASSWORD=top-night-integration-synthetic-20261001' --env 'POSTGRES_DB=top_test' --health-cmd 'pg_isready -U top_night_test -d top_test' postgres:16-alpine | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $taskPgContainerId -notmatch '^[0-9a-f]{64}$') { throw 'No se obtuvo ID PG propio válido.' }
& docker inspect --format '{{.State.Health.Status}}' $taskPgContainerId
& docker exec $taskPgContainerId pg_isready -U top_night_test -d top_test
```

Esperar a healthy y `accepting connections` antes de continuar. Guardar el **ID recién devuelto** para la nueva sesión. El ID histórico `23abbc3ac657f23f10f9c027b9d56fae48520951da9ed60db8e7a603743623ff` fue autoeliminado y no debe reutilizarse ni sustituirse silenciosamente en un guard. No usar el Compose local del producto para reproducir esta QA: ese Compose utiliza otros puertos/datos y volúmenes persistentes.

### 3. Entorno test y migraciones

Este comando está definido y usado por los scripts comprobados:

```powershell
. .\validation\backend-setup\set-test-environment.ps1
```

Limpia en la shell las variables de runtime relevantes heredadas y establece únicamente valores sintéticos. Usar una shell dedicada: cambia su entorno y PATH. No leer ni copiar `.env`.

| Variable de QA | Valor comprobado |
|---|---|
| `NODE_ENV` | `test` |
| `DATABASE_URL` | `postgresql://top_night_test:top-night-integration-synthetic-20261001@127.0.0.1:55473/top_test?schema=public` |
| `JWT_ACCESS_SECRET` | `top-night-contract-jwt-synthetic-20261001` |
| `PASSWORD_RESET_OTP_SECRET` | `top-night-contract-otp-independent-synthetic-20261001` |
| `EMAIL_DELIVERY_MODE` | `console` |
| `APP_PUBLIC_URL` inicial | `http://localhost:3001` |
| Storage | Memoria, sin variables S3 |

Estos valores son públicos y exclusivos de esta base descartable de QA; no son credenciales de cuentas reales ni secretos para producción. SMTP/S3 deben estar ausentes. `check-test-database.cjs` y el seed rechazan `.env` en backend y prisma; verifican test, la URL exacta y el actor/base SQL efectivos. No renombrar una base real para hacerla pasar por un test.

Para revisar solo la preparación, los comandos del gate registrado son:

```powershell
Push-Location -LiteralPath '.\TOP-Integration\backend'
& $taskNodeExecutable $taskPrismaCli generate
& $taskNodeExecutable '..\..\validation\backend-setup\check-test-database.cjs'
& $taskNodeExecutable $taskPrismaCli validate
& $taskNodeExecutable $taskPrismaCli migrate deploy
Pop-Location
```

No usar el script `prisma:migrate` del package para esta QA: invoca `prisma migrate dev`, mientras la corrida comprobada aplicó migraciones versionadas con `migrate deploy`. El informe registra 26 migraciones y cero pendientes. En una base nueva deberán aplicarse todas; verificar resultado antes de suites/seed.

### 4. Gates backend, en serie y antes de seed

El runner externo reproduce la secuencia comprobada, incluida la preparación anterior:

```powershell
& .\validation\backend-setup\run-backend-gates.ps1 -EjecutarGates
```

El switch es obligatorio en el script existente; su mensaje sin switch pide la autorización del integrador. Documentarlo no implica que se haya ejecutado nuevamente aquí. La secuencia literal registrada es:

```powershell
Push-Location -LiteralPath '.\TOP-Integration\backend'
& $taskNodeExecutable $taskNpmCli run build
& $taskNodeExecutable $taskNpmCli run lint
& $taskNodeExecutable $taskNpmCli run test:unit -- --runInBand
& $taskNodeExecutable $taskNpmCli run test:integration
& $taskNodeExecutable $taskNpmCli run test:e2e -- --runInBand
& $taskNodeExecutable $taskNpmCli run test:acceptance
& $taskNodeExecutable $taskNpmCli run test:coverage
& $taskNodeExecutable $taskNpmCli run architecture:check
Pop-Location
```

`test:integration` y `test:coverage` ya incluyen runInBand en package.json; aceptación no configura paralelismo. No lanzar otra suite o navegador contra esta DB mientras corren gates. Integración/E2E y aceptación `@postgres` pueden eliminar datos: su helper `cleanTestDatabase` usa deleteMany con guarda de nombre que incluye `test`. El wrapper agrega la protección de URL/actor/base exactos. La cobertura vuelve a ejecutar los 2060 tests Jest; no sumarla como 2060 casos distintos.

El runner exige rama exacta, backend limpio, Node reservado resuelto y herramientas locales presentes. Registra HEAD/árbol/dirty antes y después, exit codes/logs y los nombres no ejecutados; falla si cambia fuente o una preparación obligatoria. Crea `validation/backend-setup/gates-<timestamp>/results.json` y actualiza `latest-gates-path.txt`; revisar `conclusion=all_listed_gates_passed_for_recorded_backend_tree` antes de continuar.

Resultados históricos finales: unit 128 suites/1464 tests; integration 34/199; E2E 25/397; acceptance 196 escenarios/777 pasos; cobertura 187 suites/2060 tests, sentencias 96,59%, ramas 90,77%, funciones 96,95%, líneas 97,66%; arquitectura cero violaciones, 334 módulos/761 dependencias. Los 12 controles terminaron exit 0, fuente estable y cero omisiones. Mutation es un script real del package pero no se ejecutó en este corte; no añadirlo a los 12 PASS.

### 5. Seed QA y cuentas por rol

Solo después de terminar gates, ejecutar el seed externo comprobado:

```powershell
. .\validation\backend-setup\set-test-environment.ps1
& $taskNodeExecutable .\validation\backend-setup\seed-qa-fixtures.cjs --gates-terminados
```

El switch está definido en el script y fue usado en el seed registrado. El script comprueba URL/actor/base, ausencia de SMTP/S3/.env, cliente Prisma con displayName y columna migrada. Crea lo ausente con upsert `update: {}`; no resetea registros existentes. Verifica colisiones de identidad, User ACTIVE/emailVerifiedAt y hashes mediante Argon2 antes de anunciar login válido. Si falla, no continuar ni sobrescribir datos para forzar un PASS.

| Rol en negocio A | Email ficticio | Contraseña sintética | Membresía en negocio B |
|---|---|---|---|
| OWNER | `owner@top-night.example.invalid` | `TopNight.Owner!2026-10-01` | OWNER |
| ADMIN | `admin@top-night.example.invalid` | `TopNight.Admin!2026-10-01` | Sin membresía |
| RECEPTIONIST | `receptionist@top-night.example.invalid` | `TopNight.Reception!2026-10-01` | Sin membresía |
| VIEWER | `viewer@top-night.example.invalid` | `TopNight.Viewer!2026-10-01` | Sin membresía |

A: `a2000000-0000-4000-8000-000000000001`; B: `a2000000-0000-4000-8000-000000000002`. Todos los usuarios sintéticos están ACTIVE y verificados. OWNER tiene ambos negocios para verificar aislamiento y estados vacíos; los otros roles solo tienen A. El catálogo de roles pertenece a la membresía, no a un rol global del User. Los tokens identifican User y el backend consulta el rol vigente.

`qa-fixtures.json` guarda IDs, cuentas ficticias, origen, fechas recomendadas y limitaciones. La fecha de reservas se calcula respecto del día local de America/Asuncion; al recrear la QA cambian las fechas relativas. Hay siete estados de lectura DRAFT/PENDING/CONFIRMED/IN_PROGRESS/COMPLETED/CANCELLED/NO_SHOW, dos recursos sin imágenes, dos contactos y dos bloques. No hay PricingSnapshot, Payment ni PaymentPlan: no acreditan confirmación/lifecycle ni persistencia financiera. No inventar Timeline. B está vacío de recursos y reservas.

El `prisma/seed.ts` del producto solo carga Amenities: no crea estas cuentas, negocios o roles. `npm run create:admin-user -- <email> <password>` existe y crea User/LocalCredential mediante CLI, pero no asigna automáticamente Business, membresía ni rol; no es el seed QA. `POST /api/users` requiere autoridad GLOBAL; un OWNER/ADMIN tenant no equivale a esa autoridad. No crear usuarios reales para seguir esta guía.

Permisos comprobados en `authorization-policy.ts`: todos los roles leen; OWNER/ADMIN configuran Business/Resource/Pricing/reglas; RECEPTIONIST participa de operaciones Contact/Block/Booking/Payment aprobadas, sin configurar Resource/Pricing; VIEWER consulta. Archive Business y subscription upgrade-request pertenecen solo a OWNER. Perfil personal requiere SELF/ACTIVE y no deriva de esos roles.

### 6. Arranque QA de API y frontend

Antes del preview debe existir build frontend con `VITE_API_URL=http://127.0.0.1:3047/api`. Vite incorpora esa URL al build; cambiarla únicamente al lanzar preview no corrige un bundle ya construido. El launcher rechaza bundles que apunten a `http://localhost:3000/api` o que no contengan la URL QA esperada. El backend dist debe corresponder al árbol probado.

Comandos definidos en el launcher y usados en sesiones preservadas:

```powershell
& .\validation\backend-setup\start-isolated-qa.ps1 -LanzarQA
```

Para los casos de refetch controlado completados en dev, la variante comprobada es:

```powershell
& .\validation\backend-setup\start-isolated-qa.ps1 -LanzarQA -DevelopmentFrontend
```

Elegir una sesión a la vez. El switch DevelopmentFrontend selecciona Vite dev y no exige frontend dist; no cambia la API/harness ni convierte mocks en persistencia real. Ambos modos usan puertos exclusivos y `--strictPort`.

El launcher vuelve a cargar el entorno test y luego establece `PORT=3047`, `APP_PUBLIC_URL=http://127.0.0.1:4177`, `CORS_ORIGIN=http://127.0.0.1:4177,http://localhost:4177` y `VITE_API_URL=http://127.0.0.1:3047/api`. Verifica rama, backend/frontend limpios, paths/build/fixture, 3047 y 4177 libres, y DB SQL exacta antes del arranque. No reutiliza ni detiene otros procesos. Inicia Node con WindowStyle Hidden y logs por rol; crea `qa-runtime-<timestamp>/processes.json` con owner `top-night-isolated-qa`, PID/startTime/executable/args, HEAD/árbol y URLs.

URLs efectivas: frontend `http://127.0.0.1:4177`; API `http://127.0.0.1:3047/api`; health `http://127.0.0.1:3047/api/health`. El launcher exige HTTP 200 de frontend y health, y comunica el path del manifest nuevo. Si falla arranque intenta cerrar solo esos procesos mediante su manifest. El harness se limita a NODE_ENV=test, DB sintética y puerto 3047, usa seguridad real y bloquea autoload env antes de importar AppModule/Prisma; no valida producción.

### 7. Limpieza y ownership de la sesión nueva

Primero cerrar navegadores/suites propios. Para API/frontend usar **el manifest que devolvió la nueva ejecución**:

```powershell
$taskQaManifestPath = 'C:\Users\Sady\Documents\Codex\2026-09-30\task-2\validation\backend-setup\qa-runtime-<timestamp-nuevo>\processes.json'
& .\validation\backend-setup\stop-isolated-qa.ps1 -ManifestPath $taskQaManifestPath
```

Reemplazar el placeholder por el path literal recién generado. El script admite solo manifest bajo la carpeta reservada y owner/executable exactos. Para cada PID exige startTime, executable y todos los args; rechaza PID reutilizado. Detiene únicamente esos procesos; fallback taskkill /PID /T /F solo tras esas guardas. Actualiza stoppedAt y verifica cierre. No usar IDs/manifests históricos como si fueran la sesión nueva; una guarda que falla es evidencia a investigar, no motivo para quitarla.

El stop script no elimina PostgreSQL. La limpieza siguiente es **receta reconstruida no ejecutada en esta inspección** para el contenedor cuyo ID se capturó al recrear PG; conserva las guardas de la evidencia histórica y valida el label definido en esta receta. No usar el ID antiguo ni seleccionar contenedores con filtros amplios.

```powershell
$taskPgRecords = @(& docker inspect $taskPgContainerId | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $taskPgRecords.Count -ne 1) { throw 'No se pudo verificar el PG propio.' }
$taskPgCurrent = $taskPgRecords[0]
$taskPgBindings = @($taskPgCurrent.HostConfig.PortBindings.'5432/tcp')
if ($taskPgCurrent.Id -ne $taskPgContainerId -or $taskPgCurrent.Name -ne ('/' + $taskPgName) -or $taskPgCurrent.Config.Labels.owner -ne 'backlog_qa' -or $taskPgCurrent.Config.Image -ne 'postgres:16-alpine' -or -not $taskPgCurrent.HostConfig.AutoRemove -or $taskPgCurrent.HostConfig.Tmpfs.'/var/lib/postgresql/data' -ne 'rw,size=512m' -or @($taskPgCurrent.Mounts).Count -ne 0 -or $taskPgBindings.Count -ne 1 -or $taskPgBindings[0].HostIp -ne '127.0.0.1' -or $taskPgBindings[0].HostPort -ne '55473' -or -not $taskPgCurrent.State.Running) { throw 'Ownership/topología PG no coinciden; no detener.' }
$taskPgIdentity = (& docker exec $taskPgContainerId psql -U top_night_test -d top_test -tAc "SELECT current_database() || '|' || current_user;" | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $taskPgIdentity -ne 'top_test|top_night_test') { throw 'Identidad SQL inesperada; no detener.' }
$taskPgOtherClients = (& docker exec $taskPgContainerId psql -U top_night_test -d top_test -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname = 'top_test' AND pid <> pg_backend_pid();" | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $taskPgOtherClients -ne '0') { throw 'Hay otros clientes o no se pudieron verificar; no detener.' }
& docker stop $taskPgContainerId
if ($LASTEXITCODE -ne 0) { throw 'El cierre PG no terminó correctamente.' }
& docker ps -a --filter "id=$taskPgContainerId" --format '{{.ID}} {{.Names}}'
Get-NetTCPConnection -LocalPort 3047,4177,55473 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
```

No imprimir el objeto inspect completo ni Config.Env; la receta solo usa metadata en memoria. Verificar también ausencia por nombre y puertos libres, sin detener nada que aparezca en esas consultas. Docker --rm autoelimina únicamente el contenedor propio al salir; tmpfs borra su base. Nunca ejecutar docker prune, eliminación de volúmenes, compose down -v, taskkill por nombre genérico ni detener puertos ajenos. El stack local del producto y los datos reales quedan fuera de esta reproducción.

## Qué requiere una nueva ejecución

- PG fue eliminado: recreación, migraciones, suites y seed son trabajo pendiente para una nueva sesión, no hechos actuales.
- Los 12 PASS pertenecen al árbol backend histórico idéntico al final. Cambios nuevos de backend o runtime necesitan nueva evidencia; no heredar el PASS automáticamente.
- Si se desea acreditar CI/Node 22, hay que ejecutar ese entorno y sus controles explícitamente; Windows/Node 24 no lo sustituye.
- Cambiar equipo/path/branch/nombre DB/puertos exige revisar guardas de todos los scripts externos y usar manifests nuevos. No editar manifests viejos para sortear ownership.
- La ruta README de desarrollo con .env y Compose es otro entorno local documentado; no forma parte del entorno QA aislado aquí comprobado.

## Fuentes leídas para estas notas

Scripts y artefactos externos: set-test-environment.ps1, check-test-database.cjs, run-backend-gates.ps1, seed-qa-fixtures.cjs, qa-fixtures.json, launch-real-qa-api.cjs, start-isolated-qa.ps1, stop-isolated-qa.ps1, results/summary/REPORT final, logs de migración/seed, manifests/readiness/cleanup, final-pg-preflight, cleanup-final y qa-equivalence.

Proyecto: AGENTS.md; backend README/package.json/jest.config.cjs/docker-compose.yml/prisma seed; backend-ci.yml; clean-test-database; acceptance hooks/run-acceptance/cucumber config; Identity create-user CLI/use case/repository, Membership controller/use case, Auth/User controllers y authorization-policy; Current Status y fragmentos pertinentes de Domain Bible/Business Rules/Architecture; documentation-map. No se leyó .env ni se buscaron secretos reales. No se afirma una relectura exhaustiva de los 43 documentos/contratos revisados por el integrador original.


---

# Capítulo histórico 4 — frontend-guide-notes.md

Fuente fechada anterior a la publicación; hechos y comandos se conservan como evidencia, no como receta portable.

# Notas de apoyo: recorrido frontend para Rolo

Lectura de código, tests y evidencias existentes, 01/10/2026. Estas notas apoyan la guía del integrador. En esta tarea no se ejecutaron pruebas, navegadores, servidores, instalaciones ni modificaciones de aplicación. No contienen cuentas, contraseñas ni tokens.

## Fuente y alcance de la evidencia

El checkout leído es TOP-Integration, rama codex/night-integration-20261001, HEAD c9da5f2f48446666f9f68293463eaafc02d32aed, limpio. Su árbol frontend es 94633656e5d5010c24c75300171377aa4aca75e7, idéntico al de la fuente de aplicación congelada ee038ce9e94b8f8c7d0b61f9f5cd4fc61f8b9d9c. El HEAD posterior incorpora documentación; no se presenta como una nueva corrida de pruebas.

Hay cuatro niveles útiles al explicar qué puede comprobar Rolo:

- **API local real:** frontend contra AppModule/configureApplication, guards/pipes y PostgreSQL propios. Incluye lectura de las siete reservas, perfil y recurso sintéticos, permisos negativos y restauraciones. No equivale a validar el bootstrap productivo ni cloud.
- **Navegador con mocks:** frontend real, pero respuestas de API interceptadas y fixtures sintéticos. Acredita presentación, navegación, foco y envío del cliente; no acredita persistencia, auditoría, autorización o idempotencia del servidor.
- **Suplemento dev con mocks:** Vite dev permite importar el QueryClient real para desencadenar refetch controlado; el transporte API sigue simulado.
- **Código y Vitest:** expectativas presentes en pruebas de la suite completa final. Algunos recorridos, como conflicto de perfil, GlobalSearch y Dashboard, están respaldados por código/tests; no deben presentarse como casos de navegador con API real de la matriz final.

Evidencias finales:

| Evidencia | Resultado registrado | Localización relativa a validation |
| --- | --- | --- |
| Gates frontend | Build, lint, tests e integridad PASS. Node 24.19.0, npm 10.2.0. 106 archivos / 867 pruebas; 457,22 s | frontend-gates-20261001T061701790Z-d7a6d9d3/report.json, test.log |
| Preview final | 90 PASS, 0 FAIL, 3 SKIPPED; seis restauraciones PASS; 625 elementos medidos sin violaciones geométricas | visual-qa/runs/final-preview-ee038ce/results.json, aggregate.json, qa-summary.md |
| Regresión transversal | 24/24 PASS; nueve fallos originales cerrados; todo el transporte API es mock | transversal-regression/runs/final-ee038ce-r2/results.json |
| Refetch dev | 3/3 PASS; completa los tres casos que siguen SKIPPED en preview | visual-qa/runs/final-dev-refetch-ee038ce-r3/results.json, aggregate.json, qa-summary.md |

Son 117 casos únicos: 6 públicos, 27 con API/PG reales y 84 con mocks. No sumar los intentos fallidos o antecedentes como evidencia adicional del corte final. El warning de lint existente es formatDashboardMonth sin uso en DashboardHeader.tsx; lint salió 0, y no se afirma haberlo corregido.

Las corridas de navegador usaron Edge headless 154.0.4258.37 con 390×844, 1024×900 y 1440×900. Las capturas incluyen viewport y fullPage, con estado de scroll. No prueban dispositivos touch físicos ni certificación WCAG completa.

## Entorno y comandos para un recorrido posterior

Estos comandos se extraen de scripts y manifiestos ya ejecutados. Aquí solo se documentan; no se ejecutaron nuevamente.

### Frontend y toolchain local de la evidencia

Directorio de trabajo: C:\Users\Sady\Documents\Codex\2026-09-30\task-2\TOP-Integration\frontend

~~~powershell
$topNode = 'C:\Users\Sady\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$topFrontendNpmCli = 'C:\Users\Sady\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js'
$env:PATH = (Split-Path $topNode -Parent) + [IO.Path]::PathSeparator + $env:PATH
$env:VITE_API_URL = 'http://127.0.0.1:3047/api'
Set-Location -LiteralPath 'C:\Users\Sady\Documents\Codex\2026-09-30\task-2\TOP-Integration\frontend'
~~~

El Node absoluto y PATH importan: scripts npm como tsc/vite pueden iniciar procesos hijos. Ejecutar una CLI npm con el Node deseado no garantiza por sí solo que los hijos resuelvan ese mismo Node.

El frontend final utilizó dependencias ya copiadas/presentes en node_modules, y el runner comprueba TypeScript, Vite, Vitest y oxlint. El runner no instala dependencias. No hay evidencia de npm ci ejecutado para esta corrida local; no se debe inventar una orden Copy-Item ni un origen de copia que no conste en el registro.

Para una instalación limpia futura, frontend/Dockerfile usa npm ci --include=optional y package-lock.json, sobre node:22-bookworm-slim. Esa es la ruta oficial declarada para la imagen/CI. El README-RECOVERY.md contiene npm install y es un antecedente de reconstrucción; no describe cómo se abastecieron las dependencias de la QA final. Los resultados locales Node 24/npm 10 no equivalen a CI Node 22.

Scripts vigentes en package.json:

| Script | Implementación |
| --- | --- |
| dev | vite |
| build | tsc -b && vite build |
| lint | oxlint src tests vite.config.ts |
| test | vitest run |
| test:watch | vitest |
| test:ui | vitest --ui |
| preview | vite preview |

Comandos de gates ejecutados en la evidencia final, desde frontend:

~~~powershell
& $topNode $topFrontendNpmCli --ignore-scripts run build
& $topNode $topFrontendNpmCli --ignore-scripts run lint
& $topNode $topFrontendNpmCli --ignore-scripts run test -- --maxWorkers=1
~~~

El wrapper externo validation/run-frontend-gates.ps1 registra HEAD, rama, árbol y hashes antes/después, exige frontend limpio, rechaza archivos .env de runtime y usa la API QA exacta. Las corridas fueron seriales; no cambiar timeouts, thresholds, exclusiones ni aislamiento para reproducirlas.

### URL de backend y frontend

El cliente consume **VITE_API_URL**, no VITE_API_BASE_URL. frontend/.env.example y api-client.ts usan por defecto http://localhost:3000/api. Vite dev tiene port 3001 en vite.config.ts.

La QA final usa exclusivamente:

- API: http://127.0.0.1:3047/api
- Frontend: http://127.0.0.1:4177
- PostgreSQL propio: puerto 55473, base sintética top_test; preparación separada por el responsable backend.

La variable se fija antes del build o del arranque dev. En preview, cambiar VITE_API_URL al arrancar no reescribe un bundle ya compilado. El launcher verifica que dist apunta a 3047 y rechaza un bundle con el default 3000.

Preview probado:

~~~powershell
& $topNode .\node_modules\vite\bin\vite.js preview --host 127.0.0.1 --port 4177 --strictPort
~~~

Dev probado para el suplemento:

~~~powershell
& $topNode .\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 4177 --strictPort
~~~

El launcher externo validation/backend-setup/start-isolated-qa.ps1 -LanzarQA inicia API y frontend propios con manifiesto de procesos. El switch -DevelopmentFrontend cambia preview por Vite dev. Requiere dependencias, backend compilado, frontend compilado si es preview, fixture sintético, identidad de DB correcta, código commiteado y puertos 3047/4177 libres. No crea la base eliminada en el cierre. No utilizarlo como orden de arranque independiente de esas condiciones.

Para cambiar de preview a dev, el procedimiento probado detuvo exclusivamente los procesos del manifiesto propio mediante stop-isolated-qa.ps1 -ManifestPath <manifest-del-preview>, y después generó un manifiesto dev nuevo. No se debe detener un proceso ajeno por coincidir en un puerto.

El cierre registrado dejó API/frontend detenidos y PostgreSQL desechable eliminado, con puertos libres. Es un estado documentado del cierre; estas notas no hacen un nuevo probe del sistema.

## Matriz de acciones y resultados

### Configuración, cuenta personal y navegación

Ruta: /app/settings. En desktop se llega desde Configuración o el menú Cuenta; en móvil desde Más → Configuración o el menú de cuenta.

| Actor / acción | Resultado esperado | Evidencia |
| --- | --- | --- |
| Abrir Configuración con sesión | Secciones separadas Tu cuenta y Tu establecimiento; Business activo visible; el nombre personal no se confunde con el nombre del negocio | Código y preview real/mock |
| OWNER, ADMIN, RECEPTIONIST o VIEWER modifica su propio Nombre completo | Puede editar el nombre personal por identidad SELF ACTIVE; el rol del Business no convierte el perfil personal en perfil de establecimiento | Vitest parametrizado de los cuatro roles; preview de OWNER/VIEWER |
| Nombre vacío, solo espacios o más de 120 caracteres | Error accesible; no PATCH válido. El nombre se recorta; longitud final permitida 1–120 | PersonalProfile schema y tests |
| Nombre válido sin Motivo del cambio o con motivo solo espacios | Aparece Ingresa el motivo del cambio.; campo aria-invalid y ayuda asociada; cero PATCH | Tests de integración |
| Guardar nombre válido + motivo | Un PATCH /users/:userId/profile con displayName, reason y expectedUpdatedAt exacto. Éxito Tu nombre se guardó.; botón vuelve deshabilitado al quedar limpio | Preview real y tests |
| Observar navegación inmediatamente después de guardar | Nuevo nombre visible antes de recargar; correo continúa como identificador informativo; no cambia nombre del Business | Preview real y AppLayout tests |
| Recargar después de guardar | GET obtiene el nombre persistido. Un snapshot de sesión anterior no sustituye el perfil actual | Preview real y tests |
| Sin nombre legacy | Campo vacío; navegación usa correo como fallback; no inventa un nombre | Tests |
| Cambiar Business A → B → A antes de guardar nombre | Ruta sigue /app/settings; cambia Business visible; nombre y motivo personales sin guardar se conservan | Preview real, capturas dirty-business-a/b |
| Doble activación de Guardar durante una petición | Una operación pendiente; bloqueo antes de validación async; no roba foco tras la respuesta si el usuario ya se movió | Tests |
| Nueva sesión del mismo usuario o logout durante PATCH | Respuesta de sesión anterior se descarta antes de cambiar caché, borrador, éxito o storage de la sesión nueva | AuthContext y tests |
| GET inicial o refetch tardío después del PATCH confirmado | No reemplaza el nombre confirmado | Tests |
| Consultar correo | Solo lectura y explicación de que el cambio requiere verificación segura. No hay UI de cambio de email | Código, preview y tests |
| OWNER/ADMIN edita Tu establecimiento | Puede editar nombre, razón social opcional, identificación fiscal opcional y zona horaria IANA; moneda PYG informativa | BusinessProfilePage |
| VIEWER/RECEPTIONIST en Tu establecimiento | Campos readOnly, mensaje de rol de consulta, sin Guardar cambios | Código y preview VIEWER |
| 403/404 al guardar perfil | Bloquea edición y ofrece Actualizar cuenta; recarga acceso actual | Código y tests |
| Contraer/expandir sidebar y recargar | Preferencia en top.sidebar.collapsed.v1; navegación continúa si storage no está disponible | AppShell y tests |

Perfil y storage conservan modo SESSION/PERSISTENT; la actualización modifica displayName, manteniendo tokens y membresías. No inspeccionar/imprimir credenciales para comprobarlo: se cuenta con tests de storage y generación de sesión.

#### Conflicto de nombre: secuencia concreta

Este caso está respaldado por PersonalProfile.integration.test.tsx; no fue un conflicto real reproducido en la matriz de navegador final.

1. Abrir /app/settings con la versión leída y escribir un nuevo nombre y motivo.
2. Hacer que otra operación de la misma cuenta cambie el perfil, conservando el borrador local abierto.
3. Guardar el borrador viejo: backend devuelve 409. La UI mantiene nombre/motivo y avisa Tu perfil cambió desde que empezaste a editar.
4. Guardar nombre y Descartar nombre quedan deshabilitados; no muestra éxito.
5. Pulsar Consultar nombre actual: obtiene la versión nueva y muestra Nombre consultado: <nombre remoto>, manteniendo los campos locales.
6. Pulsar Descartar nombre: carga el nombre actual, vacía el motivo y adopta su updatedAt.
7. Editar de nuevo y guardar con motivo: utiliza la versión nueva.

Un refetch automático mientras el formulario está dirty no reemplaza la versión original del borrador. La UI no resuelve el conflicto sobrescribiendo silenciosamente el cambio remoto.

Fuentes principales: frontend/src/features/profile/components/PersonalProfile.tsx y PersonalProfile.integration.test.tsx; profile/api/user-profile.ts; profile/queries/use-user-profile.ts; auth/context/AuthContext.tsx; business/pages/BusinessProfilePage.tsx; app/layout/AppLayout.test.tsx.

### Reservas: siete estados, filtros, acciones y rutas directas

**Guía histórica del corte 2026-10-01.** La tabla inferior describe sus fixtures legacy sin Snapshot. Desde el candidato local del 2026-10-02, una PENDING nueva con precio se confirma con el primer cobro positivo o, si el total vigente es cero, mediante Confirmar sin cobro. `/confirm` se conserva para Pending legacy sin precio; no es la guía de operación de todas las PENDING. La navegación de alta directa, edición y acciones manuales vigentes están en [Estado actual](00-Current-Status.md), [Domain Bible](03-Domain-Bible.md) y [Frontend Backlog](14-Frontend-Backlog.md). La evidencia histórica de esta tabla no valida el candidato posterior.

| Código persistido | Etiqueta visible |
| --- | --- |
| DRAFT | Borrador |
| PENDING | Pendiente |
| CONFIRMED | Confirmada |
| IN_PROGRESS | En curso |
| COMPLETED | Finalizada |
| CANCELLED | Cancelada |
| NO_SHOW | No show |

Catálogo único: frontend/src/features/bookings/booking-status.ts. Las etiquetas se usan en lista, detalle, pagos, búsqueda, Dashboard y agendas. Los estados de Block, Resource, RatePlan y cuotas conservan contratos propios; no traducirlos con el catálogo Booking.

| Ruta / acción | Resultado esperado | Evidencia |
| --- | --- | --- |
| /app/bookings → abrir Filtros → seleccionar cada Estado | GET incluye status con el enum exacto; para el fixture final devuelve una reserva; esperar aria-busy=false y comprobar una sola fila/card visible con etiqueta correcta | Preview con API real y mock separados; HTTP BKG-003 |
| Estado Todos | Recupera las siete reservas del fixture | Regresión mock y tests |
| Enfocar Estado y usar ArrowDown con select cerrado | Cambia filtro, hace refetch y conserva foco en el select; filtros no se desmontan al cargar o fallar | Transversal mock y BookingListPage.test.tsx |
| Combinar Estado, Contacto y Alojamiento | Consulta intersección de filtros; referencias de otro Business no exponen datos | HTTP final BKG-003; fuente API |
| Comprobar 1024 px con filtros abiertos | Todos los controles dentro del panel; badge Pendiente completo dentro de card/tabla. La corrección usa ancho del contenedor, no solo overflow global | Geometría final y captura tablet inspeccionada |
| /app/bookings/:id DRAFT con OWNER/ADMIN/RECEPTIONIST | Editar borrador y Pasar a pendiente disponibles; Submit conserva POST submit y evento BOOKING_SUBMITTED | Código y tests |
| PENDING con rol operativo | Confirmar reserva abre /app/bookings/:id/confirm | Código |
| DRAFT/PENDING/CONFIRMED con rol operativo | Cancelar reserva pide motivo; conserva reserva e historial | Código y tests |
| VIEWER abre detalle | Sin acciones de envío/cancelación ni mutaciones de Booking | Transversal mock |
| VIEWER abre URL /app/bookings/:id/edit | Rechazo No tienes permiso para editar esta reserva. antes de formulario y consultas operativas; conserva URL; ofrece Volver a la reserva | Transversal mock y BookingRouteAccess.test.tsx |
| VIEWER abre URL /app/bookings/:id/confirm | Rechazo No tienes permiso para confirmar esta reserva. antes de consultas de reservas/recursos/tarifarios; conserva URL | Transversal mock y tests |
| Negocio suministrado distinto del activo en edición | Rechazo antes de contenido operativo | Tests |
| Doble activación síncrona de Pasar a pendiente, respuesta demorada | Exactamente un POST; estado resultante Pendiente visible | Transversal mock y BookingStates.integration.test.tsx |
| Doble Confirmar cancelación, o Submit/Cancel simultáneos | Mutex de cliente evita duplicados/cruce; después de un error permite reintento | Mocks y tests |
| Leer historial | Eventos contractuales existentes con fecha, actor y motivo; no agrega historial inventado | Tests |

El fixture real de las siete Bookings es de lectura, sin PricingSnapshot, Payment ni PaymentPlan. No se mutó lifecycle de esas reservas en la QA real; no acredita con ese fixture confirmaciones, transiciones ni finanzas persistidas.

Fuentes: BookingListPage.tsx/.css/.test.tsx, BookingDetailPage.tsx, EditBookingPage.tsx, ConfirmBookingPage.tsx, BookingRouteAccess.test.tsx y BookingStates.integration.test.tsx.

### Pagos, foco de diálogos y mutex financiero

| Ruta / acción | Resultado esperado | Evidencia |
| --- | --- | --- |
| /app/payments | Solo elegibles CONFIRMED, IN_PROGRESS y COMPLETED; etiquetas Confirmada, En curso y Finalizada | PaymentHubPage y tests |
| Buscar por huésped, ID de reserva o etiqueta de estado | Filtra las filas ya cargadas | Código y tests |
| Escribir texto sin coincidencias con filas elegibles existentes | Sin coincidencias / No encontramos reservas con esa búsqueda. y botón Limpiar búsqueda | Transversal mock |
| Activar Limpiar búsqueda con teclado | Recupera filas, limpia texto y devuelve foco a la búsqueda sin nueva solicitud | Tests y transversal |
| Sin filas elegibles desde el inicio | Sin reservas para cobrar, separado de sin coincidencias | Código |
| /app/bookings/:id/payments con VIEWER | No muestra Registrar pago ni escrituras financieras | Transversal mock |
| Abrir Registrar pago / Crear plan / Reprogramar con rol permitido | FinancialModal utiliza OverlayPanel con portal; fondo inert, scroll bloqueado, rol dialog y nombre accesible | Código y tests |
| Repetir 18 Tab y 18 Shift+Tab | Foco siempre dentro del modal | Transversal mock en móvil/desktop |
| Intentar foco sobre el fondo | Vuelve al diálogo | Transversal mock y tests |
| Escape o botón Cerrar | Cierra y devuelve foco al disparador; repetir con reduced motion | Transversal mock y tests |
| Cambiar rol a VIEWER con diálogo abierto | Se retiran diálogo y controles de escritura | Tests |
| Dos envíos síncronos de pago | Un solo registro; error visible y posibilidad de reintento | BookingPaymentsPage.test.tsx |
| Pago, plan o reprogramación mientras otra operación financiera está pendiente | financialInFlight y estados pending compartidos bloquean aperturas/envíos simultáneos; se libera en finally | Código |
| Plan con alguna cuota aplicada | Gestión del plan bloqueada; no ofrecer reprogramación como si las cuotas fueran libres | Código |

Plan editable solo para roles operativos, Booking CONFIRMED/IN_PROGRESS y sin cuotas con appliedAmountMinor > 0. La presentación de COMPLETED en el hub permite consultar historial; no convierte ese estado en editable para plan.

Los montos de pago deben ser enteros seguros mayores que cero y no superar saldo pendiente; fecha válida y no futura. El plan requiere cuotas positivas cuya suma coincida con el total. Estas validaciones UI no sustituyen las reglas del backend.

La evidencia financiera final es mock. El mutex acredita un envío del cliente, no idempotencia ni persistencia financiera real. El fixture real sin snapshot/pagos/plan puede no permitir abrir la pantalla financiera completa: no clasificarlo como regresión de la UI.

Fuentes: payments/pages/PaymentHubPage.tsx/.test.tsx, BookingPaymentsPage.tsx/.test.tsx, shared/ui/OverlayPanel.tsx.

### Recursos, fotos, permisos y edición durante refetch

Ruta: /app/resources → Ver recurso → /app/resources/:resourceId.

| Acción / actor | Resultado esperado | Evidencia |
| --- | --- | --- |
| Abrir detalle | Breadcrumb Inicio → Recursos → nombre; nombre/descripción largos legibles; código, capacidad y amenities | Código, tests y preview |
| OWNER/ADMIN con recurso no ARCHIVED | Editar recurso, switch operativo, gestión de fotos y amenities disponibles | Código y tests |
| VIEWER/RECEPTIONIST | Información legible; sin Editar recurso ni switch de estado; no PATCH de recurso permitido | UI mock + negativas reales 403 |
| RECEPTIONIST sobre ACTIVE | Puede acceder a Crear reserva y Crear bloqueo como rol operativo; esto no le da gestión del recurso/fotos | Código |
| ARCHIVED | Recurso legible; sin edición, switch ni gestión de imágenes; no ofrecer reactivación/archivo inventados | Tests |
| Poner fuera de servicio / Reactivar con OWNER/ADMIN | Etiquetas Resource ACTIVE / OUT_OF_SERVICE / ARCHIVED preservadas; transición propia con bloqueo de duplicados | Tests; no mutada en QA real |
| Fotos cargando | Cargando imagen…; no comunica álbum vacío | Código y tests |
| GET de fotos falla | No pudimos cargar las fotos. y Reintentar fotos | Código, tests y mock |
| Álbum vacío | Imagen del recurso no configurada y 0 / 10 | Preview real y mock |
| Imagen individual rota | Esta imagen no está disponible.; puede recorrer otras o Reintentar imagen | Preview mock y tests |
| Una foto | Imagen visible y 1 / 1; sin navegación múltiple | Mock |
| Diez fotos | Navegar anterior/siguiente/dots, contador; Agregar imagen deshabilitado | Mock |
| Archivo de imagen inválido | JPEG/PNG/WEBP, máximo 5 MiB (5×1024×1024), máximo 10 fotos. Error visible antes de upload inválido | Tests |
| Abrir Eliminar imagen | ConfirmDialog visible; Tab/Shift+Tab contenidos; Escape cierra y retorna foco al trigger | Preview mock y tests |
| Cancelar eliminación | No elimina imagen | Tests; navegador final abrió/canceló sin confirmar borrado |
| Editar recurso desde detalle | Abre diálogo; cierre vuelve al contexto; edición directa /app/resources/:id/edit también existe | Código y tests |
| Refetch con Nombre y Descripción dirty | Conserva ambos; campos limpios adoptan respuesta nueva. Suplemento actualiza Código interno exactamente a QA-HAB-REMOTE | Dev 3/3 mock y tests |
| Campo dirty vaciado | Refetch no lo rellena; al guardar valida el vacío | Tests |
| Cambiar usuario/Business/recurso/rol | Cambia key/scope; respuestas del contexto previo no actualizan formulario ni navegan | Código y tests |
| Cerrar formulario mientras PATCH está pendiente | AbortSignal inmediato, incluso al iniciar salida animada; respuesta tardía no cambia vista ni navega | Mock y tests |
| Doble submit antes de validación async | Un PATCH | Tests |
| Guardar nombre/descripción de recurso sintético propio | PATCH 200; reload GET muestra persistencia; restauración por UI y lectura final | Preview API real, tres viewports |

**Límites de fotos:** 1/10 imágenes del navegador fueron SVG inline mock, no S3, upload, URL firmada ni persistencia real. La prueba de eliminación de navegador no confirmó el borrado. Las pruebas unitarias de upload/delete usan API simulada. No conectar cloud para presentar estas evidencias como completas.

**Límite de refetch:** requiere frontend dev para importar /src/app/providers/QueryProvider.tsx y accionar su QueryClient. En preview se deja SUPPLEMENTAL_DEV_REQUIRED/SKIPPED. El suplemento conserva frontend real pero mock API. Abortar fetch no implica revertir una operación que ya recibió el servidor.

**Persistencia real permitida:** solo OWNER sintético, recurso ACTIVE propio, cambio de nombre/descripción con demás campos iguales, restaurados al final. No se alteró estado del recurso, imágenes ni finanzas. Las negativas VIEWER/RECEPTIONIST enviaron el nombre vigente sin cambio y recibieron 403.

Fuentes: resources/pages/ResourceDetailPage.tsx/.test.tsx, EditResourcePage.tsx/.test.tsx, components/ResourceAmenitiesEditor.tsx/.test.tsx.

### Agenda, Dashboard y búsqueda global

Estos recorridos están respaldados por source y tests incluidos en la suite final; no afirmar que todos se ejercitaron con API real en los 117 casos de navegador.

| Ruta / acción | Resultado esperado |
| --- | --- |
| /app/resources/:id → Agenda de reservas y bloqueos | Seleccionar día muestra todos sus movimientos y estados explícitos; navegar a detalle de Booking existente |
| Agenda con día denso | No oculta movimientos tras un resumen único; lista reservas/bloqueos |
| Agenda sin movimientos | Vacío explicado; no declara que el recurso está disponible |
| Consultar disponibilidad | Remite a /app/availability, fuente autoritativa separada |
| Agenda: mes anterior/siguiente/Hoy | Período y hoy en timezone del Business; cambiar contexto reinicia período/selección |
| Flechas/Home/End en día | Un día en orden Tab; selección y foco se mueven dentro del mes |
| Fechas Booking | Día de checkout exclusivo; CANCELLED y NO_SHOW fuera de movimientos mostrados |
| Fechas Block | Instantes interpretados en timezone del Business; final exclusivo; CANCELLED excluido; no inventar ruta detalle de Block |
| Cargando/error agenda | No mostrar resumen ni vacío prematuro; Reintentar consulta ambas fuentes una vez aunque se repita click |
| /app/calendar | Controles de mes/año independientes; Wizard compartido de reserva contiene foco y cancela petición al cerrar según tests |
| /app (Dashboard) | Muestra siete estados Booking del catálogo único y métricas provenientes del backend |
| Seleccionar mes Dashboard | Rango backend exacto, contexto Business/periodo y timezone correspondiente |
| Dashboard fetching/error/empty | Skeleton sin métricas anteriores, error con Reintentar, vacío Aún no hay actividad; occupancy null no se convierte en 0% inventado |
| Catálogos Dashboard | Datos reales del contexto; no rellenar con preview; si falla agregado, catálogos propios pueden seguir visibles; reintentar solo fuente fallida |
| Buscar en TOP con input vacío/1 carácter | Orientación; módulos inmediatos; entidades requieren al menos 2 caracteres, máximo 120 |
| Búsqueda global de reserva | UUID completo; no prometer búsqueda parcial de reserva por nombre |
| GlobalSearch flechas/Enter | Selecciona por id y navega; resultado tardío/de otro scope se descarta |
| Error remoto de GlobalSearch | Mensaje local y Reintentar búsqueda; módulos siguen utilizables |
| Escape GlobalSearch | Cierra y conserva/restaura foco sin reabrir ni consultas nuevas |
| Tab/click exterior GlobalSearch | Tab no atrapado; blur/click exterior cierra |
| Grupo con más resultados | Abrir módulo informa que el módulo se abre sin aplicar esta búsqueda |
| Navegar desde búsqueda a detalle cargando | Foco en contenido persistente del shell aunque cambie título temporal |

Fuentes: ResourceAvailabilityCalendar.tsx/.test.tsx; AvailabilityCalendarPage.test.tsx; dashboard/pages/DashboardPage.test.tsx; dashboard/queries/use-dashboard.test.tsx; search/components/GlobalSearch.tsx/.test.tsx.

### Cookies y almacenamiento

Ruta pública /cookies, accesible sin sesión y enlazada desde login y menú Cuenta.

| Acción | Resultado esperado |
| --- | --- |
| Abrir /cookies sin sesión | Cookies y almacenamiento local visible; sin desvío a login |
| Primer Tab → Ir a la política | Enlace de salto lleva al main |
| Índice Qué se guarda / Preferencias / Privacidad / Información legal | Anclas existentes #almacenamiento, #preferencias, #privacidad, #informacion-legal |
| Storage bloqueado | Página se puede consultar; no lee/escribe storage, no fetch |
| Leer inventario | Diferencia localStorage/sessionStorage de cookies; no ofrece categorías de analítica/publicidad inexistentes |
| Leer pendientes | Operador/responsable, contacto, jurisdicción, proveedores/ubicación, retención/condiciones pendientes explícitos |

Inventario implementado:

| Clave | Mecanismo / condición | Eliminación descrita |
| --- | --- | --- |
| top.auth.session.v1 | sessionStorage por defecto | Logout o restauración rechazada; vida de sesión del navegador |
| top.auth.session.v1 | localStorage con Mantener sesión iniciada | Sin borrado automático de entrada; logout, restauración rechazada o borrar datos del sitio; servidor controla validez |
| top.auth.reset-grant.v1 | sessionStorage tras verificar código de recuperación | Al completar cambio de contraseña; si se abandona puede permanecer aunque grant venció |
| top.sidebar.collapsed.v1 | localStorage | Actualiza contraer/expandir; sin expiración automática; se elimina al borrar datos |

La contraseña no se guarda en esas entradas; access token se mantiene en memoria. La lectura técnica no encontró escritura propia de cookies o SDK de tracking en la aplicación. No se inventó banner/consentimiento ni se afirma cumplimiento jurídico. Hosting y proveedores de producción siguen pendientes.

Fuentes: privacy/pages/CookiePolicyPage.tsx/.test.tsx, privacy/routes.tsx, app/router/appRoutes.privacy.test.tsx.

## Capturas reutilizables para la guía

Todas estas ya existen en validation/visual-qa/runs/final-preview-ee038ce; no fueron regeneradas:

- public-login-390-viewport.png
- public-cookies-390-viewport.png
- real-settings-owner-1440-viewport.png
- real-settings-viewer-390-viewport.png
- real-profile-persistence-1440-dirty-business-a-viewport.png
- real-profile-persistence-1440-dirty-business-b-viewport.png
- real-profile-persistence-1440-save-navigation-viewport.png
- real-profile-persistence-1440-persisted-viewport.png
- real-profile-persistence-1440-restore-navigation-viewport.png
- real-bookings-seven-1024-pending-viewport.png
- real-resource-zero-1440-viewport.png
- mock-resource-one-390-viewport.png
- mock-resource-ten-390-viewport.png
- mock-resource-broken-image-390-viewport.png

Para validar el clipping de filtros/Estado en 1024, preferir la captura viewport frente a fullPage, cuyo bitmap puede mostrar artefactos de cabeceras fijas durante scroll. El final midió límites del panel/card/badge, además del documento.

## Límites que deben mantenerse en la entrega

- Esta revisión solo leyó código y reportes. No repetir los PASS como si se hubieran ejecutado hoy por el redactor.
- No afirmar Production Ready: refinamientos siguen In Progress local; CI Node 22, mutation, cloud, revisión jurídica y gate preproducción no acreditados en este corte.
- No sustituir frontend real + API mock por evidencia de backend/PG.
- No usar fixtures Booking sin finanzas para declarar persistencia de pagos.
- No llamar fotografías persistidas a las imágenes SVG mock.
- No convertir los tres SKIPPED preview en PASS dentro de aquel informe; el dev R3 es suplemento separado.
- No reinterpretar estados históricos de Booking, Block, Resource o cuotas.
- No hay bloqueo para entregar la guía textual. Levantar el recorrido real posterior sí requiere recrear entorno sintético, fixtures y procesos propios conforme a la guía backend, porque el stack de QA quedó cerrado.
