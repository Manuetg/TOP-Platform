import { FinanceV2AllocationLaborCommandHandler } from './finance-v2-allocation-labor.handler';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { AllocationRulePartInput, AllocationSource, FinanceV2Mutation } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';

const BUSINESS = '11111111-1111-4111-8111-111111111111';
const OTHER_BUSINESS = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const RULE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RULE_REVISION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LINE = '44444444-4444-4444-8444-444444444444';
const LABOR = '55555555-5555-4555-8555-555555555555';
const LABOR_REVISION = '66666666-6666-4666-8666-666666666666';
const RESOURCE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RESOURCE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESOURCE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DAY = '2026-09-15';
const DATE = new Date(`${DAY}T00:00:00.000Z`);
const handler = new FinanceV2AllocationLaborCommandHandler();

interface Statement { sql: string; parameters: readonly unknown[] }
interface QueryStep { fragment: string; rows: readonly object[]; parameters?: readonly unknown[] }
interface ExpenseRow {
  id: string; amountMinor: bigint; resourceId: string | null; bookingId: string | null;
  operational: boolean; consumedOn: Date; version: number;
}
interface LaborRow {
  id: string; revisionId: string; version: number; revisionNo: number; consumedOn: Date;
  kind: string; actualExpenseLineId: string | null; estimatedMinor: bigint | null;
}
interface RuleRow {
  id: string; version: number; archived: boolean; revisionId: string; validFrom: Date; validTo: Date | null;
}

// Este doble verifica contratos SQL del handler. No simula aislamiento PostgreSQL,
// autorización OWNER, transacciones ni replay: esas garantías pertenecen al repository.
class ScriptedSql implements FinanceSqlTransaction {
  readonly reads: Statement[] = [];
  readonly writes: Statement[] = [];
  updateCount = 1;
  failInsertTable: string | null = null;

  constructor(private readonly steps: QueryStep[] = [], private readonly businessId = BUSINESS) {}

  query<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
    this.reads.push({ sql, parameters });
    const step = this.steps.shift();
    if (!step) throw new Error(`Lectura inesperada: ${sql}`);
    expect(sql).toContain(step.fragment);
    expect(sql).toMatch(/WHERE[^;]*"businessId"=\$1/);
    expect(parameters[0]).toBe(this.businessId);
    if (step.parameters) expect(parameters).toEqual(step.parameters);
    return Promise.resolve([...step.rows] as T[]);
  }

  execute(sql: string, parameters: readonly unknown[]): Promise<number> {
    this.writes.push({ sql, parameters });
    if (this.failInsertTable && sql.startsWith(`INSERT INTO "${this.failInsertTable}"`)) {
      return Promise.reject(new Error('Fallo de escritura inyectado'));
    }
    return Promise.resolve(sql.startsWith('UPDATE ') ? this.updateCount : 1);
  }

  inserts(table: string): Statement[] {
    return this.writes.filter(write => write.sql.startsWith(`INSERT INTO "${table}"`));
  }

  onlyInsert(table: string): Statement {
    const rows = this.inserts(table);
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  consumed(): void { expect(this.steps).toHaveLength(0); }
}

function mutation(command: FinanceV2Mutation['command'], businessId = BUSINESS): FinanceV2Mutation {
  return { businessId, actorUserId: ACTOR, command, idempotencyKey: 'allocation-labor-intent', fingerprint: 'stable-intent' };
}
function parts(weights: readonly number[]): AllocationRulePartInput[] {
  return weights.map((basisPoints, index) => ({ resourceId: [RESOURCE_A, RESOURCE_B, RESOURCE_C][index], basisPoints }));
}
function resourceStep(destinations: readonly AllocationRulePartInput[], available?: readonly string[]): QueryStep {
  const ids = [...new Set(destinations.map(part => part.resourceId))];
  return { fragment: 'FROM "Resource"', parameters: [BUSINESS, ids], rows: (available ?? ids).map(id => ({ id })) };
}
function expense(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return { id: LINE, amountMinor: 100001n, resourceId: null, bookingId: null, operational: true, consumedOn: DATE, version: 7, ...overrides };
}
function labor(overrides: Partial<LaborRow> = {}): LaborRow {
  return { id: LABOR, revisionId: LABOR_REVISION, version: 7, revisionNo: 3, consumedOn: DATE, kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: 100001n, ...overrides };
}
function rule(overrides: Partial<RuleRow> = {}): RuleRow {
  return { id: RULE, version: 4, archived: false, revisionId: RULE_REVISION, validFrom: new Date('2026-09-01T00:00:00.000Z'), validTo: new Date('2026-10-01T00:00:00.000Z'), ...overrides };
}
function allocationCommand(overrides: Partial<Extract<FinanceV2Mutation['command'], { type: 'APPLY_COST_ALLOCATION' }>> = {}): FinanceV2Mutation['command'] {
  return { type: 'APPLY_COST_ALLOCATION', source: { kind: 'EXPENSE_LINE', id: LINE }, expectedSourceVersion: 7, ruleId: RULE, ruleVersion: 4, expectedAllocationVersion: 2, reason: 'Distribución explícita', ...overrides };
}
interface AllocationFixture {
  source?: AllocationSource; sourceRows?: readonly object[]; ruleRows?: readonly RuleRow[];
  destinations?: AllocationRulePartInput[]; resources?: readonly string[]; currentVersion?: number;
}
function allocationSourceStep(source: AllocationSource, rows?: readonly object[]): QueryStep {
  const isExpense = source.kind === 'EXPENSE_LINE';
  return { fragment: isExpense ? 'FROM "FinanceExpenseLine"' : 'FROM "FinanceLaborCost"', parameters: [BUSINESS, source.id], rows: rows ?? [isExpense ? expense() : labor()] };
}
function allocationVersionStep(source: AllocationSource, currentVersion = 2): QueryStep {
  const isExpense = source.kind === 'EXPENSE_LINE';
  return { fragment: 'FROM "FinanceCostAllocation"', parameters: [BUSINESS, isExpense ? LINE : null, isExpense ? null : LABOR_REVISION], rows: [{ revisionNo: currentVersion }] };
}
function allocationSql(options: AllocationFixture = {}): ScriptedSql {
  const source = options.source ?? { kind: 'EXPENSE_LINE', id: LINE };
  const destinations = options.destinations ?? parts([6000, 3000, 1000]);
  const steps: QueryStep[] = [
    allocationSourceStep(source, options.sourceRows),
    { fragment: 'FROM "FinanceAllocationRule"', parameters: [BUSINESS, RULE], rows: options.ruleRows ?? [rule()] },
    { fragment: 'FROM "FinanceAllocationRulePart"', parameters: [BUSINESS, RULE_REVISION], rows: destinations },
  ];
  if (destinations.length) steps.push(resourceStep(destinations, options.resources));
  steps.push(allocationVersionStep(source, options.currentVersion));
  return new ScriptedSql(steps);
}
function minorAt(statement: Statement, index: number): bigint {
  const value = statement.parameters[index];
  if (typeof value !== 'bigint') throw new Error(`El campo ${index} debe persistir BigInt`);
  return value;
}
function stringAt(statement: Statement, index: number): string {
  const value = statement.parameters[index];
  if (typeof value !== 'string') throw new Error(`El campo ${index} debe persistir texto`);
  return value;
}
function assertAllocation(tx: ScriptedSql, resultId: string, amounts: readonly bigint[], residue: bigint): void {
  const header = tx.onlyInsert('FinanceCostAllocation');
  const destinations = tx.inserts('FinanceCostAllocationPart');
  expect(header.parameters[0]).toBe(resultId);
  expect(header.parameters[1]).toBe(BUSINESS);
  expect(header.parameters[13]).toBe(ACTOR);
  expect(minorAt(header, 8)).toBe(100001n);
  expect(minorAt(header, 11)).toBe(residue);
  expect(destinations.map(row => minorAt(row, 4))).toEqual(amounts);
  expect(destinations.map(row => row.parameters[3])).toEqual([RESOURCE_A, RESOURCE_B, RESOURCE_C].slice(0, amounts.length));
  expect(destinations.map(row => row.parameters.slice(1, 3))).toEqual(amounts.map(() => [BUSINESS, resultId]));
  expect(destinations.reduce((sum, row) => sum + minorAt(row, 4), residue)).toBe(100001n);
  expect(stringAt(header, 7)).toMatch(/^[a-f0-9]{64}$/);
  tx.consumed();
}

describe('FIN-023 execute: asignación exacta y procedencia persistida', () => {
  it.each([
    [[6000, 3000, 1000], [60001n, 30000n, 10000n], 0n],
    [[3333, 3333, 3334], [33330n, 33330n, 33341n], 0n],
    [[6000, 3000], [60000n, 30000n], 10001n],
    [[0], [0n], 100001n],
    [[], [], 100001n],
  ])('persiste 100001 PYG con puntos básicos %j sin perder el residuo', async (weights, amounts, residue) => {
    const tx = allocationSql({ destinations: parts(weights) });
    const result = await handler.execute(tx, mutation(allocationCommand()));
    expect(result).toEqual({ id: result.id, version: 3, type: 'APPLY_COST_ALLOCATION' });
    assertAllocation(tx, result.id, amounts, residue);
    const header = tx.onlyInsert('FinanceCostAllocation');
    expect(header.parameters.slice(2, 7)).toEqual([3, RULE_REVISION, LINE, null, 7]);
    expect(header.parameters.slice(9, 14)).toEqual(['ACTUAL', DAY, residue, 'Distribución explícita', ACTOR]);
    expect(tx.inserts('FinanceExpense')).toHaveLength(0);
    expect(tx.inserts('FinanceExpenseLine')).toHaveLength(0);
  });

  it('fija la revisión laboral estimada y no crea otra fuente de gasto', async () => {
    const source: AllocationSource = { kind: 'LABOR_ESTIMATE', id: LABOR };
    const tx = allocationSql({ source });
    const result = await handler.execute(tx, mutation(allocationCommand({ source })));
    assertAllocation(tx, result.id, [60001n, 30000n, 10000n], 0n);
    expect(tx.onlyInsert('FinanceCostAllocation').parameters.slice(4, 7)).toEqual([null, LABOR_REVISION, 7]);
    expect(tx.onlyInsert('FinanceCostAllocation').parameters[9]).toBe('ESTIMATE');
    expect(tx.writes).toHaveLength(4);
  });

  it('fija un hash reproducible de la fuente y detecta un cambio de versión aunque conserve importe', async () => {
    const first = allocationSql(); const second = allocationSql();
    const changed = allocationSql({ sourceRows: [expense({ version: 8 })] });
    await handler.execute(first, mutation(allocationCommand()));
    await handler.execute(second, mutation(allocationCommand()));
    await handler.execute(changed, mutation(allocationCommand({ expectedSourceVersion: 8 })));
    const originalHash = first.onlyInsert('FinanceCostAllocation').parameters[7];
    expect(second.onlyInsert('FinanceCostAllocation').parameters[7]).toBe(originalHash);
    expect(changed.onlyInsert('FinanceCostAllocation').parameters[7]).not.toBe(originalHash);
    expect(changed.onlyInsert('FinanceCostAllocation').parameters[6]).toBe(8);
  });

  it('mantiene trabajo propio como fuente separada con una revisión y base estimada', async () => {
    const source: AllocationSource = { kind: 'OWNER_IMPUTED', id: LABOR };
    const tx = allocationSql({ source, sourceRows: [labor({ kind: 'OWNER_IMPUTED' })] });
    const result = await handler.execute(tx, mutation(allocationCommand({ source })));
    assertAllocation(tx, result.id, [60001n, 30000n, 10000n], 0n);
    expect(tx.onlyInsert('FinanceCostAllocation').parameters.slice(4, 7)).toEqual([null, LABOR_REVISION, 7]);
    expect(tx.writes.every(write => !write.sql.includes('FinanceCashMovement') && !write.sql.includes('FinanceSettlement'))).toBe(true);
  });

  it.each([
    [{ expectedSourceVersion: 6 }, {}],
    [{ ruleVersion: 3 }, {}],
    [{ expectedAllocationVersion: 1 }, {}],
  ])('rechaza una versión obsoleta antes de persistir destinos: %j', async (command, fixture) => {
    const tx = allocationSql(fixture);
    await expect(handler.execute(tx, mutation(allocationCommand(command)))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(0);
  });

  it.each([
    { operational: false }, { resourceId: RESOURCE_A }, { bookingId: LABOR },
  ])('no vuelve a repartir una fuente no operativa o directamente asignada: %j', async overrides => {
    const tx = allocationSql({ sourceRows: [expense(overrides)] });
    await expect(handler.execute(tx, mutation(allocationCommand()))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(0);
  });

  it.each([
    { archived: true },
    { validFrom: new Date('2026-09-16T00:00:00.000Z') },
    { validTo: DATE },
  ])('rechaza regla archivada o consumo fuera del intervalo [desde,hasta): %j', async overrides => {
    const tx = allocationSql({ ruleRows: [rule(overrides)] });
    await expect(handler.execute(tx, mutation(allocationCommand()))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(0);
  });

  it.each(['source', 'rule', 'resource'] as const)('liga SQL al negocio y falla cerrado cuando falta %s', async missing => {
    const options: AllocationFixture = {};
    if (missing === 'source') options.sourceRows = [];
    if (missing === 'rule') options.ruleRows = [];
    if (missing === 'resource') options.resources = [RESOURCE_A, RESOURCE_B];
    const tx = allocationSql(options);
    await expect(handler.execute(tx, mutation(allocationCommand()))).rejects.toThrow(FinanceNotFoundError);
    expect(tx.writes).toHaveLength(0);
  });

  it.each([
    { actualExpenseLineId: LINE }, { kind: 'OWNER_IMPUTED' }, { estimatedMinor: null },
  ])('no asigna estimación ya real, de otro tipo o desconocida: %j', async overrides => {
    const source: AllocationSource = { kind: 'LABOR_ESTIMATE', id: LABOR };
    const tx = allocationSql({ source, sourceRows: [labor(overrides)] });
    await expect(handler.execute(tx, mutation(allocationCommand({ source })))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(0);
  });

  it('rechaza un importe DB fuera de rango seguro antes de consultar regla o escribir', async () => {
    const tx = allocationSql({ sourceRows: [expense({ amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n })] });
    await expect(handler.execute(tx, mutation(allocationCommand()))).rejects.toThrow(FinanceInputError);
    expect(tx.reads).toHaveLength(1);
    expect(tx.writes).toHaveLength(0);
  });

  it('propaga fallo de header sin insertar destinos; rollback pertenece al transaction host', async () => {
    const tx = allocationSql(); tx.failInsertTable = 'FinanceCostAllocation';
    await expect(handler.execute(tx, mutation(allocationCommand()))).rejects.toThrow('Fallo de escritura inyectado');
    expect(tx.inserts('FinanceCostAllocationPart')).toHaveLength(0);
  });

  it('aplica los 200 destinos persistidos conservando exactamente 100001 PYG y su procedencia', async () => {
    const destinations = manyParts(200);
    destinations[0].basisPoints = 6000; destinations[1].basisPoints = 3000; destinations[199].basisPoints = 1000;
    const tx = allocationSql({ destinations });
    const result = await handler.execute(tx, mutation(allocationCommand()));
    const header = tx.onlyInsert('FinanceCostAllocation');
    const writtenParts = tx.inserts('FinanceCostAllocationPart');
    expect(result.version).toBe(3); expect(writtenParts).toHaveLength(200);
    expect(header.parameters.slice(2, 7)).toEqual([3, RULE_REVISION, LINE, null, 7]);
    expect(minorAt(header, 8)).toBe(100001n); expect(minorAt(header, 11)).toBe(0n);
    expect(writtenParts.map(write => write.parameters.slice(1, 4))).toEqual(destinations.map(part => [BUSINESS, result.id, part.resourceId]));
    expect(writtenParts.filter(write => minorAt(write, 4) !== 0n).map(write => [write.parameters[3], minorAt(write, 4)])).toEqual([
      [destinations[0].resourceId, 60001n], [destinations[1].resourceId, 30000n], [destinations[199].resourceId, 10000n],
    ]);
    expect(writtenParts.reduce((total, write) => total + minorAt(write, 4), minorAt(header, 11))).toBe(100001n);
    tx.consumed();
  });

  it('rechaza 201 destinos persistidos por el límite de fuente antes de buscar recursos o escribir', async () => {
    const tx = allocationSql({ destinations: manyParts(201) });
    const execution = handler.execute(tx, mutation(allocationCommand()));
    await expect(execution).rejects.toThrow(FinanceConflictError);
    await expect(execution).rejects.toThrow('La regla supera 200 destinos; no se aplica un conjunto truncado.');
    expect(tx.reads).toHaveLength(3);
    expect(tx.reads[2].sql).toMatch(/\bLIMIT\s+201\b/i);
    expect(tx.reads.some(read => read.sql.includes('FROM "Resource"') || read.sql.includes('FROM "FinanceCostAllocation"'))).toBe(false);
    expect(tx.writes).toHaveLength(0);
  });
});

function createRule(destinations = parts([6000, 3000])): FinanceV2Mutation['command'] {
  return { type: 'CREATE_ALLOCATION_RULE', name: 'Costo común', validFrom: '2026-09-01', validTo: '2026-10-01', parts: destinations };
}
function reviseRule(destinations = parts([6000, 3000])): FinanceV2Mutation['command'] {
  return { type: 'REVISE_ALLOCATION_RULE', id: RULE, expectedVersion: 4, validFrom: '2026-09-01', validTo: null, parts: destinations, reason: 'Nueva vigencia explícita' };
}
function ruleSql(destinations: AllocationRulePartInput[], state?: { version: number; archived: boolean; revisionNo: number } | null): ScriptedSql {
  const steps = destinations.length ? [resourceStep(destinations)] : [];
  if (state !== undefined) steps.push({ fragment: 'FROM "FinanceAllocationRule"', parameters: [BUSINESS, RULE], rows: state ? [state] : [] });
  return new ScriptedSql(steps);
}
function manyParts(count: number): AllocationRulePartInput[] {
  return Array.from({ length: count }, (_, index) => ({ resourceId: `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`, basisPoints: 0 }));
}

describe('FIN-023 execute: reglas versionadas y límites', () => {
  it('crea regla/revisión/destinos exactos con actor y negocio; no genera asignaciones', async () => {
    const destinations = parts([6000, 3000]); const tx = ruleSql(destinations);
    const result = await handler.execute(tx, mutation(createRule(destinations)));
    const revision = tx.onlyInsert('FinanceAllocationRuleRevision');
    expect(result.version).toBe(1);
    expect(tx.onlyInsert('FinanceAllocationRule').parameters).toEqual([result.id, BUSINESS, 'Costo común', ACTOR]);
    expect(revision.parameters).toEqual([result.relatedIds?.revisionId, BUSINESS, result.id, 1, '2026-09-01', '2026-10-01', 'Creación manual de regla', ACTOR]);
    expect(tx.inserts('FinanceAllocationRulePart').map(write => write.parameters.slice(1))).toEqual(destinations.map(part => [BUSINESS, result.relatedIds?.revisionId, part.resourceId, part.basisPoints]));
    expect(tx.inserts('FinanceCostAllocation')).toHaveLength(0);
    tx.consumed();
  });

  it('revisa por CAS del header y añade historia usando MAX revisionNo, sin sustituir partes', async () => {
    const tx = ruleSql(parts([6000, 3000]), { version: 4, archived: false, revisionNo: 9 });
    const result = await handler.execute(tx, mutation(reviseRule()));
    expect(result.id).toBe(RULE); expect(result.version).toBe(5);
    expect(tx.writes[0].sql).toContain('UPDATE "FinanceAllocationRule" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3');
    expect(tx.writes[0].parameters).toEqual([BUSINESS, RULE, 4]);
    expect(tx.onlyInsert('FinanceAllocationRuleRevision').parameters.slice(1)).toEqual([BUSINESS, RULE, 10, '2026-09-01', null, 'Nueva vigencia explícita', ACTOR]);
    expect(tx.writes.some(write => write.sql.startsWith('DELETE ') || write.sql.startsWith('UPDATE "FinanceAllocationRulePart"'))).toBe(false);
    tx.consumed();
  });

  it.each(['CREATE_ALLOCATION_RULE', 'REVISE_ALLOCATION_RULE'] as const)('acepta el límite de 200 destinos en %s', async type => {
    const destinations = manyParts(200);
    const tx = ruleSql(destinations, type === 'REVISE_ALLOCATION_RULE' ? { version: 4, archived: false, revisionNo: 3 } : undefined);
    const command = type === 'CREATE_ALLOCATION_RULE' ? createRule(destinations) : reviseRule(destinations);
    await handler.execute(tx, mutation(command));
    expect(tx.inserts('FinanceAllocationRulePart')).toHaveLength(200);
    tx.consumed();
  });

  it.each(['CREATE_ALLOCATION_RULE', 'REVISE_ALLOCATION_RULE'] as const)('rechaza 201 destinos antes de consultar o escribir en %s', async type => {
    const destinations = manyParts(201); const tx = new ScriptedSql();
    const command = type === 'CREATE_ALLOCATION_RULE' ? createRule(destinations) : reviseRule(destinations);
    await expect(handler.execute(tx, mutation(command))).rejects.toThrow(FinanceInputError);
    expect(tx.reads).toHaveLength(0); expect(tx.writes).toHaveLength(0);
  });

  it.each([
    { destinations: parts([6000, 5000]) }, { destinations: parts([0.5]) },
    { destinations: [{ resourceId: RESOURCE_A, basisPoints: 100 }, { resourceId: RESOURCE_A, basisPoints: 100 }] },
  ])('rechaza pesos inválidos o recursos duplicados antes de persistir: %j', async ({ destinations }) => {
    const tx = new ScriptedSql();
    await expect(handler.execute(tx, mutation(createRule(destinations)))).rejects.toThrow(FinanceInputError);
    expect(tx.reads).toHaveLength(0); expect(tx.writes).toHaveLength(0);
  });

  it.each([
    null, { version: 3, archived: false, revisionNo: 3 }, { version: 4, archived: true, revisionNo: 3 },
  ])('rechaza revisión no disponible, obsoleta o archivada sin escribir: %j', async state => {
    const tx = ruleSql(parts([6000, 3000]), state);
    const expected = state === null ? FinanceNotFoundError : FinanceConflictError;
    await expect(handler.execute(tx, mutation(reviseRule()))).rejects.toThrow(expected);
    expect(tx.writes).toHaveLength(0);
  });

  it('no inserta revisión ni partes cuando CAS afecta cero filas', async () => {
    const tx = ruleSql(parts([6000, 3000]), { version: 4, archived: false, revisionNo: 3 }); tx.updateCount = 0;
    await expect(handler.execute(tx, mutation(reviseRule()))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(1);
    expect(tx.inserts('FinanceAllocationRuleRevision')).toHaveLength(0);
    expect(tx.inserts('FinanceAllocationRulePart')).toHaveLength(0);
  });
});

type CreateLabor = Extract<FinanceV2Mutation['command'], { type: 'CREATE_LABOR_COST' }>;
type ReviseLabor = Extract<FinanceV2Mutation['command'], { type: 'REVISE_LABOR_COST' }>;
function createLabor(overrides: Partial<CreateLabor> = {}): CreateLabor {
  return { type: 'CREATE_LABOR_COST', label: 'Costo calculado externamente', personLabel: 'Detalle privado', periodMonth: '2026-09', consumedOn: DAY, kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: 100001, reason: 'Registro manual', ...overrides };
}
function reviseLabor(overrides: Partial<ReviseLabor> = {}): ReviseLabor {
  return { type: 'REVISE_LABOR_COST', id: LABOR, expectedVersion: 7, actualExpenseLineId: null, estimatedMinor: 100001, reason: 'Corrección versionada', ...overrides };
}
interface LaborState { version: number; kind: string; consumedOn: Date; revisionNo: number }
function laborState(overrides: Partial<LaborState> = {}): LaborState {
  return { version: 7, kind: 'PRECOMPUTED_LABOR', consumedOn: DATE, revisionNo: 3, ...overrides };
}
function laborSql(state?: LaborState | null, actual?: { operational: boolean; consumedOn: Date } | null, reused = false): ScriptedSql {
  const steps: QueryStep[] = [];
  if (state !== undefined) steps.push({ fragment: 'FROM "FinanceLaborCost"', parameters: [BUSINESS, LABOR], rows: state ? [state] : [] });
  if (actual !== undefined) {
    steps.push({ fragment: 'FROM "FinanceExpenseLine"', parameters: [BUSINESS, LINE], rows: actual ? [actual] : [] });
    steps.push({ fragment: 'FROM "FinanceLaborCostRevision"', rows: reused ? [{ laborId: RULE }] : [] });
  }
  return new ScriptedSql(steps);
}

describe('FIN-025 execute: costo calculado externo, fuente real y trabajo propio', () => {
  it.each([null, 0, 100001, Number.MAX_SAFE_INTEGER])('conserva una estimación %s sin fabricar pago, gasto o cálculo salarial', async amount => {
    const tx = laborSql(); const result = await handler.execute(tx, mutation(createLabor({ estimatedMinor: amount })));
    expect(result.version).toBe(1);
    expect(tx.onlyInsert('FinanceLaborCost').parameters).toEqual([result.id, BUSINESS, 'Costo calculado externamente', 'Detalle privado', '2026-09', DAY, 'PRECOMPUTED_LABOR', null, ACTOR]);
    expect(tx.onlyInsert('FinanceLaborCostRevision').parameters).toEqual([result.relatedIds?.revisionId, BUSINESS, result.id, 1, null, amount === null ? null : BigInt(amount), 'Registro manual', ACTOR]);
    expect(tx.writes).toHaveLength(2); tx.consumed();
  });

  it('enlaza costo real a una línea operativa del mismo consumo y conserva estimación como alternativa', async () => {
    const tx = laborSql(undefined, { operational: true, consumedOn: DATE });
    const result = await handler.execute(tx, mutation(createLabor({ actualExpenseLineId: LINE })));
    expect(tx.reads[1].parameters).toEqual([BUSINESS, LINE, result.id]);
    expect(tx.reads[1].sql).toContain('"laborId"<>$3');
    expect(tx.onlyInsert('FinanceLaborCost').parameters[7]).toBe(LINE);
    expect(tx.onlyInsert('FinanceLaborCostRevision').parameters.slice(1)).toEqual([BUSINESS, result.id, 1, LINE, 100001n, 'Registro manual', ACTOR]);
    expect(tx.writes).toHaveLength(2); tx.consumed();
  });

  it('revisa el header por CAS y añade una revisión sin editar la historia ni fecha/tipo', async () => {
    const tx = laborSql(laborState({ revisionNo: 11 }));
    const result = await handler.execute(tx, mutation(reviseLabor()));
    expect(result.id).toBe(LABOR); expect(result.version).toBe(8);
    expect(tx.writes[0].sql).toBe('UPDATE "FinanceLaborCost" SET version=version+1,"actualExpenseLineId"=$4 WHERE "businessId"=$1 AND id=$2 AND version=$3');
    expect(tx.writes[0].parameters).toEqual([BUSINESS, LABOR, 7, null]);
    expect(tx.onlyInsert('FinanceLaborCostRevision').parameters.slice(1)).toEqual([BUSINESS, LABOR, 12, null, 100001n, 'Corrección versionada', ACTOR]);
    expect(tx.writes).toHaveLength(2); tx.consumed();
  });

  it.each([false, true])('el tipo OWNER_IMPUTED impide fuente real al %s revisar o crear', async revise => {
    const tx = revise ? laborSql(laborState({ kind: 'OWNER_IMPUTED' })) : laborSql();
    const command = revise ? reviseLabor({ actualExpenseLineId: LINE }) : createLabor({ kind: 'OWNER_IMPUTED', actualExpenseLineId: LINE });
    await expect(handler.execute(tx, mutation(command))).rejects.toThrow(FinanceInputError);
    expect(tx.writes).toHaveLength(0);
  });

  it('conserva trabajo propio opcional separado de gasto real y retiro de caja', async () => {
    const tx = laborSql(); const result = await handler.execute(tx, mutation(createLabor({ kind: 'OWNER_IMPUTED', personLabel: null })));
    expect(tx.onlyInsert('FinanceLaborCost').parameters).toEqual([result.id, BUSINESS, 'Costo calculado externamente', null, '2026-09', DAY, 'OWNER_IMPUTED', null, ACTOR]);
    expect(tx.writes).toHaveLength(2);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rechaza estimación PYG inválida %s antes de leer o escribir', async estimatedMinor => {
    const tx = new ScriptedSql();
    await expect(handler.execute(tx, mutation(createLabor({ estimatedMinor })))).rejects.toThrow(FinanceInputError);
    expect(tx.reads).toHaveLength(0); expect(tx.writes).toHaveLength(0);
  });

  it.each([
    { periodMonth: '2026-13' }, { consumedOn: '2026-10-01' }, { consumedOn: '2026-09-31' },
  ])('rechaza período inválido o consumo ajeno al mes: %j', async overrides => {
    const tx = new ScriptedSql();
    await expect(handler.execute(tx, mutation(createLabor(overrides)))).rejects.toThrow(FinanceInputError);
    expect(tx.reads).toHaveLength(0); expect(tx.writes).toHaveLength(0);
  });

  it.each([
    null, { operational: false, consumedOn: DATE }, { operational: true, consumedOn: new Date('2026-09-16T00:00:00.000Z') },
  ])('rechaza línea real ausente, no operativa o de otro consumo: %j', async actual => {
    const tx = laborSql(undefined, actual);
    await expect(handler.execute(tx, mutation(createLabor({ actualExpenseLineId: LINE })))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(0);
  });

  it('rechaza una línea real ya usada por otro costo laboral', async () => {
    const tx = laborSql(undefined, { operational: true, consumedOn: DATE }, true);
    await expect(handler.execute(tx, mutation(createLabor({ actualExpenseLineId: LINE })))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(0); tx.consumed();
  });

  it.each([null, laborState({ version: 6 })])('rechaza labor ausente u obsoleta sin crear revisión: %j', async state => {
    const tx = laborSql(state);
    const expected = state === null ? FinanceNotFoundError : FinanceConflictError;
    await expect(handler.execute(tx, mutation(reviseLabor()))).rejects.toThrow(expected);
    expect(tx.writes).toHaveLength(0);
  });

  it('no inserta una revisión laboral cuando CAS pierde la carrera', async () => {
    const tx = laborSql(laborState()); tx.updateCount = 0;
    await expect(handler.execute(tx, mutation(reviseLabor()))).rejects.toThrow(FinanceConflictError);
    expect(tx.writes).toHaveLength(1); expect(tx.inserts('FinanceLaborCostRevision')).toHaveLength(0);
  });

  it('propaga un fallo del header para que el host revierta y no inserta revisión', async () => {
    const tx = laborSql(); tx.failInsertTable = 'FinanceLaborCost';
    await expect(handler.execute(tx, mutation(createLabor()))).rejects.toThrow('Fallo de escritura inyectado');
    expect(tx.inserts('FinanceLaborCostRevision')).toHaveLength(0);
  });

  it('liga labor de otro tenant al business solicitado y no revela una fuente ausente', async () => {
    const tx = new ScriptedSql([{ fragment: 'FROM "FinanceLaborCost"', parameters: [OTHER_BUSINESS, LABOR], rows: [] }], OTHER_BUSINESS);
    await expect(handler.execute(tx, mutation(reviseLabor(), OTHER_BUSINESS))).rejects.toThrow(FinanceNotFoundError);
    expect(tx.writes).toHaveLength(0); tx.consumed();
  });
});
