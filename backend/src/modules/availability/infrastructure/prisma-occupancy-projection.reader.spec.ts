import { PrismaOccupancyProjectionReader } from './prisma-occupancy-projection.reader';

describe('PrismaOccupancyProjectionReader daily series', () => {
  const queryRaw = jest.fn();
  const reader = new PrismaOccupancyProjectionReader({ $queryRaw: queryRaw } as never);
  const input = {
    businessId: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
    from: '2026-09-18',
    to: '2026-09-21',
    timeZone: 'America/Asuncion',
  };

  beforeEach(() => jest.resetAllMocks());

  it('maps the batched daily query in ascending date order without extra queries', async () => {
    queryRaw.mockResolvedValueOnce([{ occupiedResourceNights: 5n, sellableResourceNights: 9n }]);
    queryRaw.mockResolvedValueOnce([
      { localDate: new Date('2026-09-18T00:00:00.000Z'), totalResources: 3n, occupiedResources: 1n, sellableResources: 3n },
      { localDate: new Date('2026-09-19T00:00:00.000Z'), totalResources: 3n, occupiedResources: 2n, sellableResources: 3n },
    ]);

    await expect(reader.read(input)).resolves.toMatchObject({
      occupiedResourceNights: 5,
      sellableResourceNights: 9,
      daily: [
        { date: '2026-09-18', occupiedResourceNights: 1, sellableResourceNights: 3, availableResourceNights: 2, occupancyRateBasisPoints: 3333 },
        { date: '2026-09-19', occupiedResourceNights: 2, sellableResourceNights: 3, availableResourceNights: 1, occupancyRateBasisPoints: 6667 },
      ],
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns null daily rates when a day has no sellable inventory', async () => {
    queryRaw.mockResolvedValueOnce([{ occupiedResourceNights: 0n, sellableResourceNights: 0n }]);
    queryRaw.mockResolvedValueOnce([{ localDate: new Date('2026-09-18T00:00:00.000Z'), totalResources: 1n, occupiedResources: 0n, sellableResources: 0n }]);
    await expect(reader.read(input)).resolves.toMatchObject({ daily: [{ occupancyRateBasisPoints: null, availableResourceNights: 0 }] });
  });
});
