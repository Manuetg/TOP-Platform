-- Aprovisionamiento explícito del operador después de migrate deploy o restore.
-- PostgreSQL 16. No contiene ni asigna contraseñas. El rol termina siempre NOLOGIN.
-- Aplicar sólo por socket dentro del PostgreSQL exclusivo del piloto, como top_pilot.
-- No elimina tablas, filas, historia ni objetos. Un estado ajeno aborta la transacción.
-- Los privilegios por defecto corresponden al creador top_pilot, que ejecuta migraciones.
-- https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html
BEGIN;

DO $policy$
DECLARE
    app_oid oid;
BEGIN
    IF current_database() <> 'top_pilot' OR current_user <> 'top_pilot' OR session_user <> 'top_pilot'
       OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
       OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) <> 'top_pilot' THEN
        RAISE EXCEPTION 'Se requiere el propietario bootstrap de la base exclusiva top_pilot.';
    END IF;
    IF to_regclass('public._prisma_migrations') IS NULL THEN
        RAISE EXCEPTION 'Aplicar migraciones antes de aprovisionar el rol de aplicación.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname NOT IN ('top_pilot', 'postgres', 'template0', 'template1')) THEN
        RAISE EXCEPTION 'El cluster contiene una base adicional no aprobada; no modificar permisos.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
          AND pg_get_userbyid(c.relowner) <> 'top_pilot'
    ) THEN
        RAISE EXCEPTION 'Un objeto público no pertenece al propietario esperado; revisar sin reasignarlo.';
    END IF;
    -- Las migraciones vigentes no crean funciones de aplicación SECURITY DEFINER.
    -- Un cambio futuro exige revisar su permiso antes de operar; no alterarlo aquí.
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
    ) THEN
        RAISE EXCEPTION 'Una función SECURITY DEFINER de usuario exige revisión explícita de permisos.';
    END IF;
    SELECT oid INTO app_oid FROM pg_roles WHERE rolname = 'top_pilot_app';
    IF app_oid IS NOT NULL AND (
        EXISTS (SELECT 1 FROM pg_auth_members WHERE member = app_oid OR roleid = app_oid)
        OR EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND refobjid = app_oid AND deptype = 'o')
    ) THEN
        RAISE EXCEPTION 'El rol de aplicación tiene membresías o propiedad inesperadas; revisar sin borrar objetos.';
    END IF;
    IF app_oid IS NULL THEN
        CREATE ROLE top_pilot_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
END
$policy$;

ALTER ROLE top_pilot_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE top_pilot_app RESET ALL;
ALTER ROLE top_pilot_app IN DATABASE top_pilot RESET ALL;
ALTER ROLE top_pilot_app IN DATABASE top_pilot SET search_path = pg_catalog, public;

-- No CREATE, TEMPORARY ni derechos heredados de PUBLIC en esta base.
REVOKE ALL ON DATABASE top_pilot FROM PUBLIC, top_pilot_app;
GRANT CONNECT ON DATABASE top_pilot TO top_pilot_app;
-- Este cluster exclusivo no ofrece las bases administrativas a la API. El
-- propietario bootstrap superuser conserva sus tareas de mantenimiento.
REVOKE CONNECT, TEMPORARY ON DATABASE postgres, template1 FROM PUBLIC, top_pilot_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC, top_pilot_app;
GRANT USAGE ON SCHEMA public TO top_pilot_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, top_pilot_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, top_pilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO top_pilot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO top_pilot_app;
-- La API no lee ni altera el historial administrativo de migraciones.
REVOKE ALL ON TABLE public._prisma_migrations FROM top_pilot_app;

-- Otros esquemas de usuario quedan fuera del alcance; conservar pg_catalog e
-- information_schema, necesarios para PostgreSQL/Prisma, y los esquemas internos.
DO $schemas$
DECLARE
    entry record;
BEGIN
    FOR entry IN SELECT nspname FROM pg_namespace
                 WHERE nspname NOT IN ('public', 'pg_catalog', 'information_schema')
                   AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%'
    LOOP
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC, top_pilot_app', entry.nspname);
    END LOOP;
END
$schemas$;

-- Resetear grants previos y aplicar también a objetos FUTUROS del propietario.
-- REVOKE por schema no quita grants globales; por eso se cubren ambos niveles.
ALTER DEFAULT PRIVILEGES FOR ROLE top_pilot REVOKE ALL ON TABLES FROM PUBLIC, top_pilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE top_pilot IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, top_pilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE top_pilot IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO top_pilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE top_pilot REVOKE ALL ON SEQUENCES FROM PUBLIC, top_pilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE top_pilot IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, top_pilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE top_pilot IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO top_pilot_app;
COMMIT;
