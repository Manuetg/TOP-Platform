import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/modules/business/business.contract';
import { readFinanceGuardedWriters } from '../../src/shared/infrastructure/finance-period.guard';
import { FINANCE_CLOSE_WRITERS } from '../../src/modules/finance/domain/finance-close.rules';
import { assertFinanceDatabase } from '../fixtures/finance-fixture';

const rollbackMarker = new Error('FINANCE_QA_ROLLBACK_GUARD_PROBE');

describe('Financial files guard registry: real PostgreSQL failure probes', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await assertFinanceDatabase(prisma);
  });
  afterAll(async () => { if (prisma) await prisma.$disconnect(); });

  async function expectIntact(): Promise<void> {
    const installed = await prisma.$transaction(tx => readFinanceGuardedWriters(tx));
    expect(installed.sort()).toEqual([...FINANCE_CLOSE_WRITERS].sort());
    const files = await prisma.$queryRaw<{ valid: boolean }[]>`SELECT top_finance_file_guards_installed() AS valid`;
    expect(files).toEqual([{ valid: true }]);
  }

  async function probe(sql: string, ownVerifierStillClaimsInstalled = false): Promise<void> {
    await expectIntact();
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(sql);
      const files = await tx.$queryRaw<{ valid: boolean }[]>`SELECT top_finance_file_guards_installed() AS valid`;
      expect(files).toEqual([{ valid: ownVerifierStillClaimsInstalled }]);
      const evidence = await tx.$queryRaw<{ writer: string; installed: boolean }[]>`SELECT writer, installed FROM "FinanceCloseGuardEvidence"`;
      expect(evidence).toHaveLength(40);
      expect(evidence.every(row => row.installed === false)).toBe(true);
      expect(await readFinanceGuardedWriters(tx)).toEqual([]);
      // Roll back this suite's own DDL. No production/file row is changed.
      throw rollbackMarker;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })).rejects.toBe(rollbackMarker);
    await expectIntact();
  }

  it('a missing private-file trigger removes every close writer from the verified registry', async () => {
    await probe('DROP TRIGGER top_finance_evidence_immutable ON "FinanceEvidenceFile"');
  });
  it('a disabled private-file trigger cannot be reported as installed', async () => {
    await probe('ALTER TABLE "FinanceEvidenceFile" DISABLE TRIGGER top_finance_evidence_immutable');
  });
  it('function drift fails its immutable definition hash even while the trigger remains ALWAYS', async () => {
    await probe('CREATE OR REPLACE FUNCTION public.top_finance_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$');
  });
  it('a replaced file verifier cannot assert its own installation by returning true', async () => {
    await probe('CREATE OR REPLACE FUNCTION public.top_finance_file_guards_installed() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RETURN true; END; $$', true);
  });
  it('a replaced core verifier cannot hide its own definition drift', async () => {
    await probe('CREATE OR REPLACE FUNCTION public.top_finance_guard_functions_valid() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RETURN true; END; $$', true);
  });
});
