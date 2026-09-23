import { SubscriptionBusinessNotFoundError, SubscriptionBusinessUnavailableError, SubscriptionUseCase } from './subscription.use-case';

describe('SubscriptionUseCase', () => {
  const findById = jest.fn(), get = jest.fn(), requestUpgrade = jest.fn(), countOperational = jest.fn();
  const useCase = new SubscriptionUseCase({ findById, create: jest.fn(), update: jest.fn(), list: jest.fn() }, { get, requestUpgrade }, { countOperational });
  beforeEach(() => { jest.resetAllMocks(); findById.mockResolvedValue({ status: 'ACTIVE' }); get.mockResolvedValue({ plan: { code: 'TOP_INITIAL', name: 'TOP Inicial', maxResources: 10 }, upgradeRequestedAt: null }); countOperational.mockResolvedValue(8); });
  it('compone contrato público y omite identidad interna', async () => { expect(await useCase.get('business')).toEqual({ subscription: { planCode: 'TOP_INITIAL', planName: 'TOP Inicial' }, entitlements: { maxResources: 10 }, usage: { resources: { used: 8, available: 2, percentage: 80, state: 'WARNING', canCreate: true } }, upgrade: { status: 'AVAILABLE', requestedAt: null } }); expect(countOperational).toHaveBeenCalledWith('business'); });
  it('conserva la fecha de una solicitud existente', async () => { get.mockResolvedValue({ plan: { code: 'CUSTOM', name: 'Personalizado', maxResources: 20 }, upgradeRequestedAt: new Date('2026-09-23Z') }); expect((await useCase.get('business')).upgrade).toEqual({ status: 'REQUESTED', requestedAt: '2026-09-23T00:00:00.000Z' }); });
  it.each(['SUSPENDED', 'ARCHIVED'])('rechaza negocio %s antes de consultar datos', async (status) => { findById.mockResolvedValue({ status }); await expect(useCase.get('business')).rejects.toBeInstanceOf(SubscriptionBusinessUnavailableError); expect(get).not.toHaveBeenCalled(); });
  it('rechaza negocio inexistente', async () => { findById.mockResolvedValue(null); await expect(useCase.requestUpgrade('business', 'actor')).rejects.toBeInstanceOf(SubscriptionBusinessNotFoundError); expect(requestUpgrade).not.toHaveBeenCalled(); });
  it('registra actor desde el principal, no desde un payload', async () => { requestUpgrade.mockResolvedValue({ upgradeRequestedAt: new Date('2026-09-23Z') }); await expect(useCase.requestUpgrade('business', 'actor')).resolves.toEqual({ status: 'REQUESTED', requestedAt: '2026-09-23T00:00:00.000Z' }); expect(requestUpgrade).toHaveBeenCalledWith('business', 'actor'); });
  it('propaga errores técnicos sin respuesta parcial', async () => { countOperational.mockRejectedValue(new Error('database')); await expect(useCase.get('business')).rejects.toThrow('database'); });
});
