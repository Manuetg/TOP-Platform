import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Capability } from '../../../shared/application/authorization-policy';
import { BUSINESS_ACCESS_KEY } from '../../../shared/security/security.decorators';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import type { FinanceV2ReadRepository } from '../domain/finance-v2.types';
import { FinanceV2UseCases } from '../application/finance-v2.use-cases';
import type { FinanceV2AlertsReadService } from './finance-v2-alerts.read-service';
import { FinanceV2Controller } from '../presentation/finance-v2.controller';

const id = '10000000-0000-4000-8000-000000000001';
const request = { authenticatedPrincipal: { userId: id } } as AuthenticatedRequest;
const readers = { bankMatchSources: jest.fn(), bankStatements: jest.fn(), bankMatches: jest.fn(), allocationRules: jest.fn(), laborCosts: jest.fn(), drafts: jest.fn(), draft: jest.fn(), approvalPolicy: jest.fn(), templates: jest.fn(), budget: jest.fn(), budgetComparison: jest.fn(), commitments: jest.fn(), costs: jest.fn(), resourceResults: jest.fn(), aging: jest.fn(), importPreview: jest.fn(), bankStatementPreview: jest.fn(), bankMatchPreview: jest.fn(), planningPreview: jest.fn() } satisfies FinanceV2ReadRepository;
const commands = new FinanceV2UseCases({ execute: jest.fn() });
const alerts = { read: jest.fn() } as unknown as FinanceV2AlertsReadService;
const controller = new FinanceV2Controller(readers, commands, alerts);

function handler(name: string): object {
  const value: unknown = Object.getOwnPropertyDescriptor(FinanceV2Controller.prototype, name)?.value;
  if (typeof value !== 'function') throw new Error('Missing handler');
  return value;
}

describe('Finance V2 controller invocation and metadata, no real HTTP server', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('mounts under the globally prefixed business Finance V2 path', () => { expect(Reflect.getMetadata(PATH_METADATA, FinanceV2Controller)).toBe('businesses/:businessId/finance/v2'); });
  it.each([
    ['drafts', Capability.FINANCE_READ], ['draft', Capability.FINANCE_READ], ['policy', Capability.FINANCE_READ], ['templates', Capability.FINANCE_READ],
    ['budget', Capability.FINANCE_PLANNING], ['budgetComparison', Capability.FINANCE_PLANNING], ['commitments', Capability.FINANCE_READ],
    ['bankSources', Capability.FINANCE_READ], ['bankStatements', Capability.FINANCE_READ], ['bankMatches', Capability.FINANCE_READ], ['rules', Capability.FINANCE_READ],
    ['labor', Capability.FINANCE_LABOR], ['costs', Capability.FINANCE_READ], ['resources', Capability.FINANCE_READ], ['aging', Capability.FINANCE_READ], ['alerts', Capability.FINANCE_READ],
    ['historyPreview', Capability.FINANCE_IMPORT], ['bankPreview', Capability.FINANCE_IMPORT], ['matchPreview', Capability.FINANCE_READ], ['planningPreview', Capability.FINANCE_PLANNING],
  ] as const)('uses the exact Owner Finance capability for %s including readonly POST previews', (name, capability) => {
    expect(Reflect.getMetadata(BUSINESS_ACCESS_KEY, handler(name))).toEqual({ parameter: 'businessId', capabilities: [capability] });
  });
  it('uses a real write capability for commands', () => { expect(Reflect.getMetadata(BUSINESS_ACCESS_KEY, handler('command'))).toEqual({ parameter: 'businessId', capabilities: [Capability.FINANCE_WRITE] }); });
  it('rejects an unauthenticated caller before invoking a reader', async () => {
    await expect(controller.drafts(id, {}, {} as AuthenticatedRequest)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(readers.drafts).not.toHaveBeenCalled();
  });
  it('passes a parsed bank UUID page and server actor to its actual reader port', async () => {
    readers.bankStatements.mockResolvedValue({ items: [], nextCursor: null });
    await controller.bankStatements(id, { cursor: id, limit: '10' }, request);
    expect(readers.bankStatements).toHaveBeenCalledWith({ businessId: id, actorUserId: id }, { cursor: id, limit: 10 });
  });
  it('rejects forged authority in a readonly preview before calling its port', async () => {
    await expect(controller.historyPreview(id, { sourceNamespace: 'demo', csv: 'csv', actorUserId: id }, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(readers.importPreview).not.toHaveBeenCalled();
  });
  it('maps the exact shared period SQL error to a safe 409 without SQL internals', async () => {
    readers.drafts.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('private SQL', { code: 'P2010', clientVersion: '6.19.3', meta: { code: 'P0001', message: 'FINANCE_PERIOD_CLOSED private SQL' } }));
    await expect(controller.drafts(id, {}, request)).rejects.toBeInstanceOf(ConflictException);
    try { await controller.drafts(id, {}, request); } catch (error) { expect((error as Error).message).not.toContain('private SQL'); }
  });
  it('propagates unknown bugs instead of relabeling them as valid client input failures', async () => {
    const error = new Error('unexpected'); readers.drafts.mockRejectedValue(error);
    await expect(controller.drafts(id, {}, request)).rejects.toBe(error);
  });
});
