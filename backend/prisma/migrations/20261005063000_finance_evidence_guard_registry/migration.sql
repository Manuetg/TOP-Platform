-- Completa la evidencia del trigger privado de archivos sin editar el baseline original.
BEGIN;
CREATE TABLE public."FinanceGuardFileFunctionBaseline" (
  signature text PRIMARY KEY,
  "definitionSha256" text NOT NULL CHECK ("definitionSha256" ~ '^[a-f0-9]{64}$')
);
REVOKE ALL ON public."FinanceGuardFileFunctionBaseline" FROM PUBLIC;
GRANT SELECT ON public."FinanceGuardFileFunctionBaseline" TO PUBLIC;
CREATE FUNCTION public.top_finance_file_guards_installed() RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $file_guard$
DECLARE v_signature text; v_expected text; v_oid oid;
BEGIN
  IF (SELECT count(*) FROM public."FinanceGuardFileFunctionBaseline")<>2 THEN RETURN false; END IF;
  FOREACH v_signature IN ARRAY ARRAY['public.top_finance_evidence_immutable()','public.top_finance_file_guards_installed()'] LOOP
    SELECT "definitionSha256" INTO v_expected FROM public."FinanceGuardFileFunctionBaseline" WHERE signature=v_signature;
    v_oid:=to_regprocedure(v_signature);
    IF v_expected IS NULL OR v_oid IS NULL THEN RETURN false; END IF;
    IF encode(sha256(convert_to(pg_get_functiondef(v_oid),'UTF8')),'hex') IS DISTINCT FROM v_expected THEN RETURN false; END IF;
  END LOOP;
  RETURN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid='public."FinanceEvidenceFile"'::regclass
    AND trigger.tgname='top_finance_evidence_immutable'
    AND trigger.tgfoid=to_regprocedure('public.top_finance_evidence_immutable()')
    AND NOT trigger.tgisinternal AND trigger.tgenabled='A' AND trigger.tgtype=27
    AND trigger.tgnargs=0 AND trigger.tgqual IS NULL AND trigger.tgparentid=0
    AND cardinality(trigger.tgattr::smallint[])=0 AND NOT trigger.tgdeferrable AND NOT trigger.tginitdeferred)
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid='public."FinanceGuardFileFunctionBaseline"'::regclass
    AND trigger.tgname='top_finance_file_registry_immutable'
    AND trigger.tgfoid=to_regprocedure('public.top_finance_guard_registry_immutable()')
    AND NOT trigger.tgisinternal AND trigger.tgenabled='A' AND trigger.tgtype=31
    AND trigger.tgnargs=0 AND trigger.tgqual IS NULL AND trigger.tgparentid=0
    AND cardinality(trigger.tgattr::smallint[])=0 AND NOT trigger.tgdeferrable AND NOT trigger.tginitdeferred);
END;
$file_guard$;
INSERT INTO public."FinanceGuardFileFunctionBaseline"(signature,"definitionSha256")
SELECT signature,encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')
FROM unnest(ARRAY['public.top_finance_evidence_immutable()','public.top_finance_file_guards_installed()']) signatures(signature);
CREATE TRIGGER top_finance_file_registry_immutable BEFORE INSERT OR UPDATE OR DELETE ON public."FinanceGuardFileFunctionBaseline"
FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_registry_immutable();
ALTER TABLE public."FinanceGuardFileFunctionBaseline" ENABLE ALWAYS TRIGGER top_finance_file_registry_immutable;
CREATE OR REPLACE VIEW public."FinanceCloseGuardEvidence" AS
WITH manifest AS (SELECT public.top_finance_guard_manifest() AS body),
targets AS (
 SELECT key AS table_name,'public.top_finance_guard_row()'::text AS signature FROM manifest,jsonb_each(body->'tables')
 UNION ALL SELECT 'FinancePeriod','public.top_finance_guard_period()'
 UNION ALL SELECT 'FinanceCloseSnapshot','public.top_finance_guard_close_history()'
 UNION ALL SELECT 'FinanceCloseEvent','public.top_finance_guard_close_history()'
), dml AS (
 SELECT target.table_name,EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger
  JOIN pg_catalog.pg_class relation ON relation.oid=trigger.tgrelid JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
  WHERE namespace.nspname='public' AND relation.relname=target.table_name AND trigger.tgname='top_finance_dml_guard'
   AND trigger.tgfoid=to_regprocedure(target.signature) AND NOT trigger.tgisinternal AND trigger.tgenabled='A'
   AND trigger.tgtype=31 AND trigger.tgnargs=0 AND trigger.tgqual IS NULL AND trigger.tgparentid=0
   AND cardinality(trigger.tgattr::smallint[])=0 AND NOT trigger.tgdeferrable AND NOT trigger.tginitdeferred) AS installed
 FROM targets target
), protocol AS (
 SELECT bool_and(EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger JOIN pg_catalog.pg_class relation ON relation.oid=trigger.tgrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
  WHERE namespace.nspname='public' AND relation.relname=target.table_name AND trigger.tgname='top_finance_protocol_commit'
   AND trigger.tgfoid=to_regprocedure('public.top_finance_guard_period_commit()') AND NOT trigger.tgisinternal AND trigger.tgenabled='A'
   AND trigger.tgtype=target.type AND trigger.tgnargs=0 AND trigger.tgqual IS NULL AND trigger.tgparentid=0
   AND cardinality(trigger.tgattr::smallint[])=0 AND trigger.tgdeferrable AND trigger.tginitdeferred AND trigger.tgconstraint<>0)) AS installed
 FROM (VALUES('FinancePeriod',21),('FinanceCloseSnapshot',5),('FinanceCloseEvent',5)) target(table_name,type)
), registry AS (
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger WHERE trigger.tgrelid='public."FinanceGuardFunctionBaseline"'::regclass
  AND trigger.tgname='top_finance_registry_immutable' AND trigger.tgfoid=to_regprocedure('public.top_finance_guard_registry_immutable()')
  AND NOT trigger.tgisinternal AND trigger.tgenabled='A' AND trigger.tgtype=31 AND trigger.tgnargs=0
  AND trigger.tgqual IS NULL AND trigger.tgparentid=0 AND cardinality(trigger.tgattr::smallint[])=0) AS installed
), writer_targets AS (
 SELECT writer.key AS writer,target.value#>>'{}' AS table_name FROM manifest,jsonb_each(body->'writers') writer,
  LATERAL jsonb_array_elements(writer.value) target WHERE writer.key<>'DIRECT_SQL_IMPORT'
 UNION ALL SELECT 'DIRECT_SQL_IMPORT',table_name FROM targets
)
SELECT writer_targets.writer,
 bool_and(coalesce(dml.installed,false)) AND public.top_finance_guard_functions_valid() AND public.top_finance_file_guards_installed()
  AND (SELECT installed FROM protocol) AND (SELECT installed FROM registry) AS installed
FROM writer_targets LEFT JOIN dml USING(table_name) GROUP BY writer_targets.writer;
GRANT SELECT ON public."FinanceCloseGuardEvidence" TO PUBLIC;
DO $verify_files$
BEGIN
  IF NOT public.top_finance_file_guards_installed()
    OR (SELECT count(*) FROM public."FinanceCloseGuardEvidence")<>40
    OR EXISTS(SELECT 1 FROM public."FinanceCloseGuardEvidence" WHERE installed IS NOT TRUE) THEN
    RAISE EXCEPTION 'FINANCE_FILE_GUARDS_NOT_INSTALLED' USING ERRCODE='P0001';
  END IF;
END;
$verify_files$;
COMMIT;
