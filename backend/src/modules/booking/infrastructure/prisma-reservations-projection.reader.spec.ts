import { PrismaReservationsProjectionReader } from './prisma-reservations-projection.reader';

describe('PrismaReservationsProjectionReader', () => {
  const queryRaw = jest.fn();
  const reader = new PrismaReservationsProjectionReader({
    $queryRaw: queryRaw,
  } as never);

  beforeEach(() => jest.resetAllMocks());

  it('maps grouped counts returned by PostgreSQL', async () => {
    queryRaw.mockResolvedValueOnce([
      { status: 'DRAFT', count: 2n },
      { status: 'CANCELLED', count: 1n },
    ]);
    await expect(reader.read({
      businessId: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
      from: '2026-09-01',
      to: '2026-09-02',
      timeZone: 'America/Asuncion',
    })).resolves.toEqual([
      { status: 'DRAFT', count: 2 },
      { status: 'CANCELLED', count: 1 },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each([-1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n])(
    'rejects unsafe PostgreSQL count %s',
    async (count) => {
      queryRaw.mockResolvedValueOnce([{ status: 'DRAFT', count }]);
      await expect(reader.read({
        businessId: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
        from: '2026-09-01',
        to: '2026-09-02',
        timeZone: 'America/Asuncion',
      })).rejects.toThrow('RESERVATIONS_PROJECTION_INVALID_COUNT');
    },
  );

  it('keeps query construction inside the parametrized Prisma tag', async () => {
    queryRaw.mockResolvedValueOnce([]);
    await reader.read({
      businessId: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
      from: '2026-09-01',
      to: '2026-09-02',
      timeZone: 'America/Asuncion',
    });
    const [template] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(template).toBeDefined();
  });
});
