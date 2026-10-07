-- Verify function definitions outside the functions being verified. Preserve both applied immutable baselines.
BEGIN;
CREATE OR REPLACE VIEW public."FinanceCloseGuardEvidence" AS
WITH definitions AS (
 SELECT
  (SELECT count(*)=19 AND bool_and(coalesce(encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(b.signature)),'UTF8')),'hex')=b."definitionSha256",false))
   FROM public."FinanceGuardFunctionBaseline" b)
  AND
  (SELECT count(*)=2 AND bool_and(coalesce(encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(b.signature)),'UTF8')),'hex')=b."definitionSha256",false))
   FROM public."FinanceGuardFileFunctionBaseline" b) AS valid
), manifest AS (SELECT public.top_finance_guard_manifest() AS body),
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
  AND (SELECT coalesce(valid,false) FROM definitions)
  AND (SELECT installed FROM protocol) AND (SELECT installed FROM registry) AS installed
FROM writer_targets LEFT JOIN dml USING(table_name) GROUP BY writer_targets.writer;
GRANT SELECT ON public."FinanceCloseGuardEvidence" TO PUBLIC;
DO $verify_external$
BEGIN
 IF (SELECT count(*) FROM public."FinanceCloseGuardEvidence")<>40
  OR EXISTS(SELECT 1 FROM public."FinanceCloseGuardEvidence" WHERE installed IS NOT TRUE) THEN
  RAISE EXCEPTION 'FINANCE_GUARD_EXTERNAL_VERIFICATION_FAILED' USING ERRCODE='P0001';
 END IF;
END;
$verify_external$;
COMMIT;
