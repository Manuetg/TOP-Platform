import { createHash, randomUUID } from 'node:crypto';
import type { AllocationRulePartInput, FinanceV2Mutation, FinanceV2Result, AllocationSource } from '../domain/finance-v2.types';
import { allocateCost } from '../domain/finance-allocation';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import { applyCommonCostRule, CommonCostSource } from '../application/finance-v2-cost.rules';
import { requireExactVersion } from '../application/finance-v2-policy.rules';
import { planningDate } from '../application/finance-v2-planning.rules';
import { validatePeriodMonth } from '../application/finance-v2-budget.handler';
import type { FinanceSqlTransaction, FinanceV2CommandHandler } from './finance-v2.repository';
import { requireUpdated, sqlDate } from './finance-v2-draft.sql-store';

interface AllocationBasis extends CommonCostSource { sourceExpenseLineId: string | null; sourceLaborRevisionId: string | null; basis: 'ACTUAL' | 'ESTIMATE'; hash: string }
type AllocationRuleCommand = Extract<FinanceV2Mutation['command'], { type: 'CREATE_ALLOCATION_RULE' | 'REVISE_ALLOCATION_RULE' }>;
type LaborCostCommand = Extract<FinanceV2Mutation['command'], { type: 'CREATE_LABOR_COST' | 'REVISE_LABOR_COST' }>;
interface RevisionVersion { version: number; revisionNo: number }
interface LaborRevisionState extends RevisionVersion { kind: string; consumedOn: string }
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function readAllocationBasis(tx: FinanceSqlTransaction, businessId: string, ref: AllocationSource): Promise<AllocationBasis> {
  if (ref.kind === 'EXPENSE_LINE') {
    const rows = await tx.query<{ id: string; amountMinor: bigint; resourceId: string | null; bookingId: string | null; operational: boolean; consumedOn: Date; version: number }>('SELECT l.id,l."amountMinor",l."resourceId",l."bookingId",l.operational,e."consumedOn",e.version FROM "FinanceExpenseLine" l JOIN "FinanceExpense" e ON e.id=l."expenseId" AND e."businessId"=l."businessId" WHERE l."businessId"=$1 AND l.id=$2', [businessId, ref.id]);
    if (!rows[0]) throw new FinanceNotFoundError('Fuente de costo no disponible.');
    const row = rows[0];
    const source = { ...row, businessId, amountMinor: safeMoney(row.amountMinor), consumedOn: sqlDate(row.consumedOn), sourceExpenseLineId: row.id, sourceLaborRevisionId: null, basis: 'ACTUAL' as const };
    return { ...source, hash: digest(source) };
  }
  const rows = await tx.query<{ id: string; revisionId: string; version: number; revisionNo: number; consumedOn: Date; kind: string; actualExpenseLineId: string | null; estimatedMinor: bigint | null }>('SELECT l.id,l.version,l.kind,l."consumedOn",r.id AS "revisionId",r."revisionNo",r."actualExpenseLineId",r."estimatedMinor" FROM "FinanceLaborCost" l JOIN "FinanceLaborCostRevision" r ON r."laborId"=l.id AND r."businessId"=l."businessId" WHERE l."businessId"=$1 AND l.id=$2 ORDER BY r."revisionNo" DESC LIMIT 1', [businessId, ref.id]);
  const row = rows[0];
  if (!row) throw new FinanceNotFoundError('Fuente laboral no disponible.');
  if ((ref.kind === 'OWNER_IMPUTED') !== (row.kind === 'OWNER_IMPUTED') || row.actualExpenseLineId !== null) throw new FinanceConflictError('La asignación estimada requiere una fuente sin costo real.');
  const source = { id: row.id, businessId, version: row.version, consumedOn: sqlDate(row.consumedOn), amountMinor: row.estimatedMinor === null ? null : safeMoney(row.estimatedMinor), resourceId: null, bookingId: null, operational: true, sourceExpenseLineId: null, sourceLaborRevisionId: row.revisionId, basis: 'ESTIMATE' as const };
  return { ...source, hash: digest({ ...source, revisionNo: row.revisionNo }) };
}

export class FinanceV2AllocationLaborCommandHandler implements FinanceV2CommandHandler {
  readonly commandTypes = ['CREATE_ALLOCATION_RULE','REVISE_ALLOCATION_RULE','APPLY_COST_ALLOCATION','CREATE_LABOR_COST','REVISE_LABOR_COST'] as const;
  bookingReferences(): Promise<readonly string[]> { return Promise.resolve([]); }
  async execute(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const c = input.command;
    if (c.type === 'CREATE_ALLOCATION_RULE' || c.type === 'REVISE_ALLOCATION_RULE') return this.rule(tx, input);
    if (c.type === 'APPLY_COST_ALLOCATION') return this.allocate(tx, input);
    if (c.type === 'CREATE_LABOR_COST' || c.type === 'REVISE_LABOR_COST') return this.labor(tx, input);
    throw new FinanceInputError('Intención de costos inválida.');
  }
  private async rule(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const c = input.command;
    if (c.type !== 'CREATE_ALLOCATION_RULE' && c.type !== 'REVISE_ALLOCATION_RULE') throw new FinanceInputError('Regla inválida.');
    planningDate(c.validFrom); if (c.validTo !== null && planningDate(c.validTo) <= planningDate(c.validFrom)) throw new FinanceInputError('Vigencia de regla inválida.');
    if (!Array.isArray(c.parts) || c.parts.length > 200) throw new FinanceInputError('Demasiados destinos.');
    const id = c.type === 'CREATE_ALLOCATION_RULE' ? randomUUID() : c.id;
    allocateCost(1, { id, version: 1, parts: c.parts });
    await this.requireResources(tx, input.businessId, c.parts);
    const { version, revisionNo } = await this.allocationRuleVersion(tx, input, c, id);
    const revisionId = randomUUID();
    await tx.execute('INSERT INTO "FinanceAllocationRuleRevision" (id,"businessId","ruleId","revisionNo","validFrom","validTo",reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,CURRENT_TIMESTAMP)', [revisionId, input.businessId, id, revisionNo, c.validFrom, c.validTo, c.type === 'REVISE_ALLOCATION_RULE' ? c.reason : 'Creación manual de regla', input.actorUserId]);
    for (const part of c.parts) await tx.execute('INSERT INTO "FinanceAllocationRulePart" (id,"businessId","revisionId","resourceId","basisPoints","createdAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, revisionId, part.resourceId, part.basisPoints]);
    return { id, version, type: c.type, relatedIds: { revisionId } };
  }
  private async allocate(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const c = input.command; if (c.type !== 'APPLY_COST_ALLOCATION') throw new FinanceInputError('Asignación inválida.');
    const source = await readAllocationBasis(tx, input.businessId, c.source);
    const rules = await tx.query<{ id: string; version: number; archived: boolean; revisionId: string; validFrom: Date; validTo: Date | null }>('SELECT r.id,r.version,r.archived,v.id AS "revisionId",v."validFrom",v."validTo" FROM "FinanceAllocationRule" r JOIN "FinanceAllocationRuleRevision" v ON v."ruleId"=r.id AND v."businessId"=r."businessId" WHERE r."businessId"=$1 AND r.id=$2 ORDER BY v."revisionNo" DESC LIMIT 1', [input.businessId, c.ruleId]);
    const rule = rules[0]; if (!rule) throw new FinanceNotFoundError('Regla no disponible.');
    requireExactVersion(rule.version, c.ruleVersion); if (rule.archived) throw new FinanceConflictError('Regla archivada.');
    const parts = await tx.query<AllocationRulePartInput>('SELECT "resourceId","basisPoints" FROM "FinanceAllocationRulePart" WHERE "businessId"=$1 AND "revisionId"=$2 ORDER BY "resourceId" LIMIT 201', [input.businessId, rule.revisionId]);
    if (parts.length > 200) throw new FinanceConflictError('La regla supera 200 destinos; no se aplica un conjunto truncado.');
    const resourceIds = await this.requireResources(tx, input.businessId, parts);
    const result = applyCommonCostRule(source, { id: rule.id, businessId: input.businessId, version: rule.version, validFrom: sqlDate(rule.validFrom), validTo: rule.validTo === null ? null : sqlDate(rule.validTo), parts }, input.businessId, c.expectedSourceVersion, resourceIds);
    const versions = await tx.query<{ revisionNo: number }>('SELECT COALESCE(MAX("revisionNo"),0)::int AS "revisionNo" FROM "FinanceCostAllocation" WHERE "businessId"=$1 AND "sourceExpenseLineId" IS NOT DISTINCT FROM $2 AND "sourceLaborRevisionId" IS NOT DISTINCT FROM $3', [input.businessId, source.sourceExpenseLineId, source.sourceLaborRevisionId]);
    const current = versions[0]?.revisionNo ?? 0; requireExactVersion(current, c.expectedAllocationVersion);
    const id = randomUUID();
    await tx.execute('INSERT INTO "FinanceCostAllocation" (id,"businessId","revisionNo","ruleRevisionId","sourceExpenseLineId","sourceLaborRevisionId","sourceVersion","sourceHash","sourceAmountMinor","sourceBasis","consumedOn","unassignedMinor",reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::"FinanceCostBasis",$11::date,$12,$13,$14,CURRENT_TIMESTAMP)', [id, input.businessId, current + 1, rule.revisionId, source.sourceExpenseLineId, source.sourceLaborRevisionId, source.version, source.hash, BigInt(source.amountMinor!), source.basis, source.consumedOn, BigInt(result.unassignedMinor), c.reason, input.actorUserId]);
    for (const part of result.allocations) await tx.execute('INSERT INTO "FinanceCostAllocationPart" (id,"businessId","allocationId","resourceId","amountMinor","createdAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, id, part.resourceId, BigInt(part.amountMinor)]);
    return { id, version: current + 1, type: c.type };
  }
  private async labor(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const c = input.command; if (c.type !== 'CREATE_LABOR_COST' && c.type !== 'REVISE_LABOR_COST') throw new FinanceInputError('Costo laboral inválido.');
    if (c.estimatedMinor !== null && (!Number.isSafeInteger(c.estimatedMinor) || c.estimatedMinor < 0)) throw new FinanceInputError('Estimación PYG inválida.');
    const id = c.type === 'CREATE_LABOR_COST' ? randomUUID() : c.id;
    const { version, revisionNo, kind, consumedOn } = await this.laborRevisionState(tx, input, c, id);
    await this.requireLaborSource(tx, input, c, id, kind, consumedOn);
    if (c.type === 'CREATE_LABOR_COST') await tx.execute('INSERT INTO "FinanceLaborCost" (id,"businessId",label,"personLabel","periodMonth","consumedOn",kind,version,"actualExpenseLineId","recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6::date,$7::"FinanceLaborCostKind",1,$8,$9,CURRENT_TIMESTAMP)', [id, input.businessId, c.label, c.personLabel, c.periodMonth, c.consumedOn, c.kind, c.actualExpenseLineId, input.actorUserId]);
    else await requireUpdated(tx, 'UPDATE "FinanceLaborCost" SET version=version+1,"actualExpenseLineId"=$4 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, id, c.expectedVersion, c.actualExpenseLineId]);
    const revisionId = randomUUID();
    await tx.execute('INSERT INTO "FinanceLaborCostRevision" (id,"businessId","laborId","revisionNo","actualExpenseLineId","estimatedMinor",reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)', [revisionId, input.businessId, id, revisionNo, c.actualExpenseLineId, c.estimatedMinor === null ? null : BigInt(c.estimatedMinor), c.reason, input.actorUserId]);
    return { id, version, type: c.type, relatedIds: { revisionId } };
  }
  private async allocationRuleVersion(tx: FinanceSqlTransaction, input: FinanceV2Mutation, c: AllocationRuleCommand, id: string): Promise<RevisionVersion> {
    let version = 1; let revisionNo = 1;
    if (c.type === 'REVISE_ALLOCATION_RULE') {
      const rows = await tx.query<{ version: number; archived: boolean; revisionNo: number }>('SELECT r.version,r.archived,COALESCE(MAX(v."revisionNo"),0)::int AS "revisionNo" FROM "FinanceAllocationRule" r LEFT JOIN "FinanceAllocationRuleRevision" v ON v."ruleId"=r.id AND v."businessId"=r."businessId" WHERE r."businessId"=$1 AND r.id=$2 GROUP BY r.id', [input.businessId, id]);
      if (!rows[0]) throw new FinanceNotFoundError('Regla no disponible.');
      requireExactVersion(rows[0].version, c.expectedVersion); if (rows[0].archived) throw new FinanceConflictError('Regla archivada.');
      await requireUpdated(tx, 'UPDATE "FinanceAllocationRule" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, id, c.expectedVersion]);
      version = rows[0].version + 1; revisionNo = rows[0].revisionNo + 1;
    } else await tx.execute('INSERT INTO "FinanceAllocationRule" (id,"businessId",name,archived,version,"recordedByUserId","createdAt") VALUES ($1,$2,$3,false,1,$4,CURRENT_TIMESTAMP)', [id, input.businessId, c.name, input.actorUserId]);
    return { version, revisionNo };
  }
  private async laborRevisionState(tx: FinanceSqlTransaction, input: FinanceV2Mutation, c: LaborCostCommand, id: string): Promise<LaborRevisionState> {
    let version = 1; let revisionNo = 1; let kind: string; let consumedOn: string;
    if (c.type === 'CREATE_LABOR_COST') { validatePeriodMonth(c.periodMonth); planningDate(c.consumedOn); kind = c.kind; consumedOn = c.consumedOn; if (!consumedOn.startsWith(c.periodMonth + '-')) throw new FinanceInputError('Consumo fuera del período laboral.'); }
    else {
      const rows = await tx.query<{ version: number; kind: string; consumedOn: Date; revisionNo: number }>('SELECT l.version,l.kind,l."consumedOn",COALESCE(MAX(r."revisionNo"),0)::int AS "revisionNo" FROM "FinanceLaborCost" l LEFT JOIN "FinanceLaborCostRevision" r ON r."laborId"=l.id AND r."businessId"=l."businessId" WHERE l."businessId"=$1 AND l.id=$2 GROUP BY l.id', [input.businessId, id]);
      if (!rows[0]) throw new FinanceNotFoundError('Costo laboral no disponible.'); requireExactVersion(rows[0].version, c.expectedVersion);
      kind = rows[0].kind; consumedOn = sqlDate(rows[0].consumedOn); version = rows[0].version + 1; revisionNo = rows[0].revisionNo + 1;
    }
    return { version, revisionNo, kind, consumedOn };
  }
  private async requireLaborSource(tx: FinanceSqlTransaction, input: FinanceV2Mutation, c: LaborCostCommand, id: string, kind: string, consumedOn: string): Promise<void> {
    if (kind === 'OWNER_IMPUTED' && c.actualExpenseLineId !== null) throw new FinanceInputError('El trabajo imputado del dueño no crea ni duplica un gasto real.');
    if (c.actualExpenseLineId !== null) {
      const sources = await tx.query<{ operational: boolean; consumedOn: Date }>('SELECT l.operational,e."consumedOn" FROM "FinanceExpenseLine" l JOIN "FinanceExpense" e ON e.id=l."expenseId" AND e."businessId"=l."businessId" WHERE l."businessId"=$1 AND l.id=$2', [input.businessId, c.actualExpenseLineId]);
      if (!sources[0] || !sources[0].operational || sqlDate(sources[0].consumedOn) !== consumedOn) throw new FinanceConflictError('El costo laboral real requiere una línea operativa del mismo consumo.');
      const used = await tx.query<{ laborId: string }>('SELECT DISTINCT "laborId" FROM "FinanceLaborCostRevision" WHERE "businessId"=$1 AND "actualExpenseLineId"=$2 AND "laborId"<>$3', [input.businessId, c.actualExpenseLineId, id]);
      if (used.length) throw new FinanceConflictError('La línea de gasto ya es fuente de otro costo laboral.');
    }
  }
  private async requireResources(tx: FinanceSqlTransaction, businessId: string, parts: readonly AllocationRulePartInput[]): Promise<string[]> {
    const ids = [...new Set(parts.map(part => part.resourceId))];
    const rows = ids.length ? await tx.query<{ id: string }>('SELECT id FROM "Resource" WHERE "businessId"=$1 AND id=ANY($2::text[])', [businessId, ids]) : [];
    if (rows.length !== ids.length) throw new FinanceNotFoundError('Recurso no disponible.'); return ids;
  }
}
