# TOP — Prueba de arranque del paquete QA portable

## Validación posterior del paquete — 2026-10-01

Smoke con bootstrap normal ejecutado entre 2026-10-01T13:26:46.7709064Z y 2026-10-01T13:27:54.9700346Z, Node 24.19.0/PowerShell 7.6.5, PG nuevo sintético y app HEAD 9c2e8e6cffd36024881c8be6720f132bbd8d7cc4. Seis HTTP200 reales (health/UI/login/perfil/siete Bookings/dos Resources), assertions y cierre de API/frontend/PG propios PASS; 3047/4177/55473 libres. No se repitieron las suites completas ni se instaló nada. Backend55a2290/frontend94633656 limpios e idénticos.

El primer intento falló por readiness. El segundo realizó los controles funcionales y cleanup, pero el recolector falló al escribir result.json por archivo ocupado; ambos resultados originales se preservan. Se distinguen functionalSmokeStatus=PASS y reportingStatus=FAILED_FILE_OCCUPIED_ORIGINAL_PRESERVED. No declarar que el runner completo pasó sin errores. No se repitió el smoke por el fallo del recolector.

Start-QA usa ReadyTimeoutSeconds=180, rango10..300 y detección de salida propia; solo cambió soporte. La causa del primer timeout no quedó probada. Node22/PowerShell5.1 runtime y un recorrido nuevo de navegador siguen pendientes. La API normal puede escuchar fuera de loopback; rigen la máquina QA dedicada y red restringida del README.

Evidencia y proceso públicos en https://github.com/Manuetg/TOP-Platform/blob/codex/night-integration-20261001/docs/16-Portable-QA-Startup.md; PR101 conserva CI por head exacto.

## Comandos de la prueba

Se ejecutaron con paths existentes del entorno QA y PG/manifest nuevos, conservados en evidencia privada. Variables RepoRoot/NodeExecutable/NpmCliPath son las tres rutas parametrizadas de la receta.

```powershell
. .\Set-QAEnvironment.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath
# Primer intento: prisma generate, identidad, migrate deploy y npm run build (todos exit0).
# Segundo intento: identidad y migrate deploy en la DB nueva; sin repetir generate/build.
& .\Seed-QAFixtures.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath -PgContainerId $taskPgContainerId -PgName $taskPgName -PgRunId $taskPgRunId -GatesTerminados
& .\Start-QA.ps1 -RepoRoot $taskRepoRoot -NodeExecutable $taskNodeExecutable -NpmCliPath $taskNpmCliPath -PgContainerId $taskPgContainerId -PgName $taskPgName -PgRunId $taskPgRunId -LanzarQA -ReadyTimeoutSeconds 180
# HTTP con cliente PowerShell; token solo en memoria, no publicado.
& .\Stop-QA.ps1 -ManifestPath $taskNewManifestPath
# PG: guardas de ID/nombre/label/tmpfs/0mounts/loopback/actor/0clients, docker stop del ID propio.
```

GatesTerminados se apoyó en los 12 gates históricos del mismo árbol backend; no declara una nueva corrida de suites ni valida el wrapper completo Run-BackendGates de nuevo. La creación PG y el cierre detallados están en [la receta portable](../scripts/qa/README.md).

# Smoke fresco portable de TOP: historial y resultado

Esta evidencia corresponde al paquete de soporte externo, con bootstrap normal `backend/dist/src/main.js`, Node 24.19.0 y configuración sintética development, PostgreSQL propio descartable, correo console y storage memoria. No usa harness privado ni modifica fuentes de backend/frontend. Los 12 gates completos históricos corresponden al mismo árbol backend 55a2290d933a810bd1c60249738d6c204a5d2df6; no se repitieron suites completas durante este smoke.

## Intento 1 preservado: FAIL de readiness

Entre 13:12:16 y 13:17:55 UTC del 01/10/2026. Resultado original inmutable en `result-attempt-1.json`. PostgreSQL propio: ID 6ef6a99492caef8d2786c4c6cae3d2306abf6361d4155621eabbaaf74d7cbf86, nombre top-portable-qa-pg-be2967e5185042c691642a5668b6f1b0, label de sesión be2967e5185042c691642a5668b6f1b0. Imagen local postgres:16-alpine; --pull never, --rm, tmpfs datos 512m, cero mounts y bind exclusivo 127.0.0.1:55473:5432. Guardas SQL verificaron base top_test/actor top_night_test y cero otros client backend antes de preparación/seed/arranque y cierre.

Prisma generate, identidad SQL, migrate deploy y build backend terminaron exit 0; seed wrapper terminó correctamente con flag GatesTerminados apoyado en los 12 gates históricos del árbol idéntico y sin suites activas. Generate tardó unos 54 segundos; build, unos 164. No se instalaron dependencias.

Start-QA agotó su ventana anterior de readiness y produjo exactamente: `API/frontend no respondieron; revisar logs de esta sesión.` No hay PASS de health/UI/login/lecturas en este intento. API stdout y stderr quedaron ambos en cero bytes; proceso API seguía vivo antes del Stop. Vite preview anunció 127.0.0.1:4177 sin stderr. El bootstrap compilado invoca correctamente bootstrap normal; no se encontró un error runtime concreto en logs. Carga/IO lenta y ventana insuficiente son una hipótesis, no una causa probada.

Stop-QA cerró exclusivamente PID 3144 (API) y 19636 (Vite) mediante manifest nuevo, startTime/executable/commandline/args exactos. PG fue detenido tras nuevas guardas y autoeliminado. 3047/4177/55473 quedaron libres. `cleanup_incomplete_requires_review` del resultado original corresponde a la comparación global de contenedores: durante la ventana aparecieron tres contenedores ajenos adicionales, mientras los diez del baseline leído conservaron ID/nombre/State. Adiciones observadas: ad11889d4c4b (confident_ganguly), f10c6b712947 (testcontainers-ryuk-86341f6c-d682-4df2-a034-f735a0ebd98b), d37f1d6fec17 (dk-sifen-backend-retry). No se emitió comando de stop/remove/update sobre ellos. El resultado conserva el delta observado; no afirma estados globales inmutables.

Las comprobaciones finales de fuente, ejecutadas fuera de esa comparación interrumpida, confirmaron backend/frontend limpios y árboles 55a2290d933a810bd1c60249738d6c204a5d2df6 / 94633656e5d5010c24c75300171377aa4aca75e7. Los logs, manifiestos y fixture JSON de este intento se conservan privados, fuera del paquete publicable.

## Corrección autorizada de soporte y segundo intento

Se cambia únicamente Start-QA.ps1 del soporte: ReadyTimeoutSeconds default 180, rango 10..300, polling acotado con 500 ms entre intentos y detección inmediata de procesos propios terminados. Parseo PowerShell 7 y Windows PowerShell 5.1 PASS; hashes de paquete actualizados. No cambia aplicación ni contratos ni se amplían timeouts de pruebas. El FAIL anterior permanece preservado.

Segundo intento autorizado: PG y manifest nuevos, seed wrapper y bootstrap normal; no repetir generate/migrate/build sobre fuentes/artefactos ya preparados salvo migraciones indispensables para la nueva base. La base nueva sí necesita migrate deploy; no se repite generate ni build. Los códigos HTTP de health/UI se capturan desde StatusCode; para login/lecturas se utiliza StatusCodeVariable real del cliente PowerShell. Ningún token, contraseña, hash ni cuerpo privado se publica.

El segundo intento terminó el 01/10/2026 a las 13:27:54 UTC: PASS funcional y cierre propio, con fallo separado del recolector al escribir result.json por archivo ocupado. Resultado original inmutable: result-attempt-2.json, status fresh_smoke_failed y error literal preservados. final-result.json/result.json separan functionalSmokeStatus=PASS de reportingStatus=FAILED_FILE_OCCUPIED_ORIGINAL_PRESERVED; no se presenta el driver como una ejecución íntegra sin errores. No hubo tercera ejecución ni repetición de requests para resolver el fallo de escritura.

## Resultado funcional del segundo intento, con evidencia cerrada

Ventana 13:26:46–13:27:54 UTC. Runtime Node 24.19.0 / PowerShell 7.6.5. Fuente HEAD 9c2e8e6cffd36024881c8be6720f132bbd8d7cc4; árboles backend 55a2290d933a810bd1c60249738d6c204a5d2df6 y frontend 94633656e5d5010c24c75300171377aa4aca75e7 limpios e idénticos antes/después. Paquete de soporte congelado durante el intento; su hash de manifest se registra en final-result.json. No se acredita ejecución PowerShell5.1/Node22 del paquete: esos entornos conservan únicamente la verificación de sintaxis y CI de aplicación, respectivamente.

PG NUEVO ID 1e8ba24b46af6e2260535997e30ff03432023fe0bae9c7a1e07d633a60ea1534, nombre top-portable-qa-pg-ab87d798eca14085b9c8483d1f15011a, label de sesión ab87d798eca14085b9c8483d1f15011a. --pull never, postgres:16-alpine local, --rm, tmpfs 512m, cero mounts, loopback55473; guardas exactas identity/topología/healthy/cero otros client backend pasaron antes de seed/arranque y cierre. Identidad y migrate deploy terminaron exit0; la DB nueva recibió las migraciones. No se repitió generate/build porque ya habían terminado exit0 en intento1 con la misma fuente/artefactos. Seed-QAFixtures wrapper completó sin excepción; flag GatesTerminados respaldado por gates históricos del árbol idéntico, no por suites nuevas.

Seis respuestas HTTP reales capturadas, todas 200: GET /api/health; frontend / con HTML; POST /api/auth/login OWNER sintético; GET perfil SELF con nombre Operadora QA de nombre largo e ID esperado; GET Bookings con siete reservas y los siete estados; GET Resources con dos recursos. Los cuatro códigos REST provienen de StatusCodeVariable real, no constantes inferidas. Tokens/contraseñas/hashes y cuerpos privados omitidos.

El bootstrap normal registró Nest application successfully started; stdout actualizado a 13:27:47 UTC. Timeout de soporte configurado180segundos; se conserva la hipótesis de lentitud/carga para el primer intento sin afirmar causa exacta. API PID15476 y frontend PID35004 cerrados por Stop-QA y manifest nuevo con fecha/executable/commandline/args exactos. PG propio detenido exit0 y autoeliminado; puertos3047/4177/55473 libres. Delta de contenedores ajenos en este segundo intento vacío y cero comandos de mutación ajena. Logs y manifest quedaron privados en private/attempt-2.

El error del recolector fue: The process cannot access the file '.../portable-smoke/result.json' because it is being used by another process. El snapshot original demuestra que ya se habían completado las seis respuestas y assertions; finally cerró los recursos propios y verificó paquete/fuentes. El fallo de escritura se conserva como incidente de reporting, sin falsear el status original ni sustituirlo por un rerun. Resultado funcional PASS, reporter FAILED; final-result.json es la síntesis posterior explícita de esa evidencia, no un resultado nativo nuevo del driver.
