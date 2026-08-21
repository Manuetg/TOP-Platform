import {
  AvailabilityBusinessNotFoundError,
  AvailabilityBusinessUnavailableError,
  AvailabilityResourceNotFoundError,
  InvalidAvailabilityInputError,
} from '../application/check-availability.use-case';
import { AvailabilityController } from './availability.controller';

describe('AvailabilityController', () => {
  const check = { execute: jest.fn() };
  const calendar = { execute: jest.fn() };
  const controller = new AvailabilityController(check as never, calendar as never);

  beforeEach(() => jest.resetAllMocks());

  it('delegates the calendar query exactly and returns its public result', async () => {
    const result = {
      from: '2026-04-01',
      to: '2026-04-02',
      resources: [],
    };
    calendar.execute.mockResolvedValueOnce(result);

    await expect(
      controller.listCalendar(
        '11111111-1111-4111-8111-111111111111',
        '2026-04-01',
        '2026-04-02',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toBe(result);
    expect(calendar.execute).toHaveBeenCalledWith({
      businessId: '11111111-1111-4111-8111-111111111111',
      from: '2026-04-01',
      to: '2026-04-02',
      resourceId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it.each([
    new InvalidAvailabilityInputError('bad'),
    new AvailabilityBusinessNotFoundError('missing business'),
    new AvailabilityResourceNotFoundError('missing resource'),
    new AvailabilityBusinessUnavailableError('inactive'),
  ])('maps known Availability errors', async (error) => {
    calendar.execute.mockRejectedValueOnce(error);
    await expect(
      controller.listCalendar(
        '11111111-1111-4111-8111-111111111111',
        '2026-04-01',
        '2026-04-02',
      ),
    ).rejects.toMatchObject({ message: error.message });
  });

  it('propagates unexpected errors instead of mapping them as HTTP conflicts', async () => {
    const error = new Error('database unavailable');
    calendar.execute.mockRejectedValueOnce(error);

    await expect(
      controller.listCalendar(
        '11111111-1111-4111-8111-111111111111',
        '2026-04-01',
        '2026-04-02',
      ),
    ).rejects.toBe(error);
  });
});
