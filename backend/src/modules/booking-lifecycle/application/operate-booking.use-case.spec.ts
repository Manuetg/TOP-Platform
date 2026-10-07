import { InvalidBookingInputError } from '../../booking/booking.contract';
import { BookingOperation } from '../booking-operation.contract';
import { OperateBookingUseCase } from './operate-booking.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const expectedUpdatedAt = '2026-10-02T12:00:00.123Z';

describe('OperateBookingUseCase', () => {
  const execute = jest.fn();
  const useCase = new OperateBookingUseCase({ execute });
  const input = () => ({ businessId, bookingId, actorUserId, expectedUpdatedAt, operation: BookingOperation.CHECK_IN });
  beforeEach(() => jest.resetAllMocks());

  it.each(Object.values(BookingOperation))('passes the authenticated actor and exact version for %s', async (operation) => {
    execute.mockResolvedValue({ status: 'IN_PROGRESS' });
    await expect(useCase.execute({ ...input(), operation, reason: '  Ingreso registrado  ' })).resolves.toEqual({ status: 'IN_PROGRESS' });
    expect(execute).toHaveBeenCalledWith({ businessId, bookingId, actorUserId, operation, expectedUpdatedAt: new Date(expectedUpdatedAt), reason: 'Ingreso registrado' });
  });

  it.each([undefined, null, '', '2026-10-02', '2026-10-02T12:00:00Z', '2026-10-02T12:00:00.123+00:00', '2026-02-30T12:00:00.123Z'])('rejects a missing or noncanonical version %s without a write', (version) => {
    expect(() => useCase.execute({ ...input(), expectedUpdatedAt: version })).toThrow(InvalidBookingInputError);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['businessId', 'bookingId', 'actorUserId'] as const)('rejects an invalid %s before a transaction', (field) => {
    expect(() => useCase.execute({ ...input(), [field]: 'invalid' })).toThrow(InvalidBookingInputError);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([1, 'x', '   ', 'a'.repeat(501)])('rejects an invalid reason without a write', (reason) => {
    expect(() => useCase.execute({ ...input(), reason })).toThrow(InvalidBookingInputError);
    expect(execute).not.toHaveBeenCalled();
  });
});
