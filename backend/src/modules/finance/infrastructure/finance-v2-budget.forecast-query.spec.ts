import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import type { FinanceV2ReadRepository } from '../domain/finance-v2.types';
import { FinanceV2UseCases } from '../application/finance-v2.use-cases';
import type { FinanceV2AlertsReadService } from './finance-v2-alerts.read-service';
import { FinanceV2Controller } from '../presentation/finance-v2.controller';
import { parseFinanceV2BudgetComparisonQuery } from './finance-composition.validation';

const id = '10000000-0000-4000-8000-000000000001';
const request = { authenticatedPrincipal: { userId: id } } as AuthenticatedRequest;
const basis = 'ACTUAL_PLUS_PENDING_COMMITMENTS';

describe('contrato readonly opt-in de previsión presupuestaria', () => {
  it('consulta original sólo mes preserva default sin proyección', () => {
    expect(parseFinanceV2BudgetComparisonQuery({ periodMonth: '2026-09' })).toEqual({ periodMonth: '2026-09', forecastBasis: null });
  });
  it('acepta únicamente la base explícita aprobada', () => {
    expect(parseFinanceV2BudgetComparisonQuery({ periodMonth: '2026-09', forecastBasis: basis })).toEqual({ periodMonth: '2026-09', forecastBasis: basis });
  });
  it.each(['SCENARIO', '', 'actual_plus_pending_commitments', null, false, ['ACTUAL_PLUS_PENDING_COMMITMENTS']])('rechaza base %j sin inferir supuestos', forecastBasis => {
    expect(() => parseFinanceV2BudgetComparisonQuery({ periodMonth: '2026-09', forecastBasis })).toThrow();
  });
  it.each(['actorUserId', 'businessId', 'amountMinor', 'probabilityBasisPoints', 'asOf', 'scenarioToken'])('rechaza campo no autorizado %s', field => {
    expect(() => parseFinanceV2BudgetComparisonQuery({ periodMonth: '2026-09', [field]: id })).toThrow();
  });
  it.each(['2026-00', '2026-13', '2026-9', '0000-01'])('rechaza mes %s', periodMonth => {
    expect(() => parseFinanceV2BudgetComparisonQuery({ periodMonth, forecastBasis: basis })).toThrow();
  });
  it('propaga base validada y actor servidor; nunca invoca command writer', async () => {
    const { controller, budgetComparison, execute } = fixture();
    await controller.budgetComparison(id, { periodMonth: '2026-09', forecastBasis: basis }, request);
    expect(budgetComparison).toHaveBeenCalledWith({ businessId: id, actorUserId: id }, '2026-09', basis);
    expect(execute).not.toHaveBeenCalled();
  });
  it('propaga default null al reader y rechaza monto manual antes de leer', async () => {
    const { controller, budgetComparison } = fixture();
    await controller.budgetComparison(id, { periodMonth: '2026-09' }, request);
    expect(budgetComparison).toHaveBeenCalledWith({ businessId: id, actorUserId: id }, '2026-09', null);
    budgetComparison.mockClear();
    await expect(controller.budgetComparison(id, { periodMonth: '2026-09', forecastBasis: basis, amountMinor: 1200000 }, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(budgetComparison).not.toHaveBeenCalled();
  });
});

function fixture() {
  const budgetComparison = jest.fn(); const execute = jest.fn();
  const readers = { budgetComparison } as unknown as FinanceV2ReadRepository;
  const controller = new FinanceV2Controller(readers, new FinanceV2UseCases({ execute }), { read: jest.fn() } as unknown as FinanceV2AlertsReadService);
  return { controller, budgetComparison, execute };
}
