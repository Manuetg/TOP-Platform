import { Logger } from '@nestjs/common';
import { BusinessStatus } from '../../business/business.contract';
import { Business } from '../../business/domain/business.entity';
import type { BusinessRepository } from '../../business/domain/business.repository';
import type { RevenueProjectionReader } from '../../payment/payment.contract';
import {
  GetRevenueKpiUseCase,
  RevenueKpiInputError,
  RevenueKpiInvariantError,
  RevenueKpiNotFoundError,
} from './get-revenue-kpi.use-case';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';

function business(status = BusinessStatus.ACTIVE): Business {
  return Business.create({
    id: businessId,
    businessNumber: null,
    name: 'TOP',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('GetRevenueKpiUseCase', () => {
  const findById = jest.fn<
    ReturnType<BusinessRepository['findById']>,
    Parameters<BusinessRepository['findById']>
  >();
  const read = jest.fn<
    ReturnType<RevenueProjectionReader['read']>,
    Parameters<RevenueProjectionReader['read']>
  >();
  const subject = new GetRevenueKpiUseCase(
    {
      create: jest.fn(),
      findById,
      list: jest.fn(),
      update: jest.fn(),
    },
    { read },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findById.mockResolvedValue(business());
    read.mockResolvedValue({
      amounts: [{ currency: 'PYG', amountMinor: 750_000 }],
    });
  });

  it('returns recorded payments revenue and delegates the Business timezone', async () => {
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-10',
    })).resolves.toEqual({ currency: 'PYG', amountMinor: 750_000 });
    expect(read).toHaveBeenCalledWith({
      businessId,
      from: '2026-09-01',
      to: '2026-09-10',
      timeZone: 'America/Asuncion',
    });
  });

  it('returns the Business currency and zero for an empty period', async () => {
    read.mockResolvedValueOnce({ amounts: [] });
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).resolves.toEqual({ currency: 'PYG', amountMinor: 0 });
  });

  it('allows an archived Business because Revenue is historical read-only data', async () => {
    findById.mockResolvedValueOnce(business(BusinessStatus.ARCHIVED));
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).resolves.toEqual({ currency: 'PYG', amountMinor: 750_000 });
  });

  it('accepts exactly 31 days and future dates', async () => {
    await expect(subject.execute({
      businessId,
      from: '2099-01-01',
      to: '2099-02-01',
    })).resolves.toBeDefined();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['2026/09/01', '2026-09-02'],
    ['2026-02-30', '2026-03-02'],
    ['2026-09-02', '2026-09-02'],
    ['2026-09-03', '2026-09-02'],
    ['2026-01-01', '2026-02-02'],
  ])('rejects an invalid period %s..%s', async (from, to) => {
    await expect(subject.execute({ businessId, from, to }))
      .rejects.toBeInstanceOf(RevenueKpiInputError);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects an invalid Business identifier before lookup', async () => {
    await expect(subject.execute({
      businessId: 'invalid',
      from: '2026-09-01',
      to: '2026-09-02',
    })).rejects.toBeInstanceOf(RevenueKpiInputError);
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a missing Business without reading Payment data', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).rejects.toBeInstanceOf(RevenueKpiNotFoundError);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'a different currency',
      amounts: [{ currency: 'USD', amountMinor: 1 }],
    },
    {
      label: 'multiple currencies',
      amounts: [
        { currency: 'PYG', amountMinor: 1 },
        { currency: 'USD', amountMinor: 1 },
      ],
    },
    {
      label: 'a negative amount',
      amounts: [{ currency: 'PYG', amountMinor: -1 }],
    },
    {
      label: 'a decimal amount',
      amounts: [{ currency: 'PYG', amountMinor: 1.5 }],
    },
    {
      label: 'an unsafe integer amount',
      amounts: [{ currency: 'PYG', amountMinor: Number.MAX_SAFE_INTEGER + 1 }],
    },
  ])('reports $label as an internal invariant violation', async ({ amounts }) => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    read.mockResolvedValueOnce({ amounts });
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).rejects.toBeInstanceOf(RevenueKpiInvariantError);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'revenue_kpi_invariant_violation',
      businessId,
      expectedCurrency: 'PYG',
      amounts,
    }));
    log.mockRestore();
  });
});
