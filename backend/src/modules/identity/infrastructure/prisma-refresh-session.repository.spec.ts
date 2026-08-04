import { PrismaIdentityService } from './prisma-identity.service';
import { PrismaRefreshSessionRepository } from './prisma-refresh-session.repository';

const row = { id: 'session-id', userId: 'user-id', tokenHash: 'token-hash', expiresAt: new Date('2027-01-01'), revokedAt: null, replacedBySessionId: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') };

describe('PrismaRefreshSessionRepository', () => {
  const prisma = new PrismaIdentityService();
  const repository = new PrismaRefreshSessionRepository(prisma);

  beforeEach(() => jest.restoreAllMocks());

  it('crea una sesión persistiendo solo el hash', async () => {
    const create = jest.spyOn(prisma.refreshSession, 'create').mockResolvedValue(row);
    await expect(repository.create({ userId: row.userId, tokenHash: row.tokenHash, expiresAt: row.expiresAt })).resolves.toMatchObject(row);
    expect(create).toHaveBeenCalledWith({ data: { userId: row.userId, tokenHash: row.tokenHash, expiresAt: row.expiresAt } });
  });

  it('consulta exactamente por tokenHash y retorna null si no existe', async () => {
    const findUnique = jest.spyOn(prisma.refreshSession, 'findUnique').mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    await expect(repository.findByTokenHash(row.tokenHash)).resolves.toMatchObject(row);
    await expect(repository.findByTokenHash('missing')).resolves.toBeNull();
    expect(findUnique).toHaveBeenNthCalledWith(1, { where: { tokenHash: row.tokenHash } });
    expect(findUnique).toHaveBeenNthCalledWith(2, { where: { tokenHash: 'missing' } });
  });

  it('revoca únicamente una sesión activa y omite una inexistente o revocada', async () => {
    jest.spyOn(prisma.refreshSession, 'findUnique').mockResolvedValueOnce(row).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...row, revokedAt: new Date('2026-02-01') });
    const update = jest.spyOn(prisma.refreshSession, 'update').mockResolvedValue(row);
    const revokedAt = new Date('2026-02-02');
    await repository.revokeByTokenHash(row.tokenHash, revokedAt);
    await repository.revokeByTokenHash('missing', revokedAt);
    await repository.revokeByTokenHash('revoked', revokedAt);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: row.id }, data: { revokedAt } });
  });

  it('rota de forma transaccional creando la sucesora y revocando la anterior', async () => {
    const transaction = new PrismaIdentityService();
    const create = jest.spyOn(transaction.refreshSession, 'create').mockResolvedValue({ ...row, id: 'next-session-id' });
    const update = jest.spyOn(transaction.refreshSession, 'update').mockResolvedValue(row);
    jest.spyOn(prisma, '$transaction').mockImplementation(async (callback) => callback(transaction));
    const revokedAt = new Date('2026-02-01');
    await repository.rotate(row.id, { userId: row.userId, tokenHash: 'next-hash', expiresAt: row.expiresAt }, revokedAt);
    expect(create).toHaveBeenCalledWith({ data: { userId: row.userId, tokenHash: 'next-hash', expiresAt: row.expiresAt } });
    expect(update).toHaveBeenCalledWith({ where: { id: row.id }, data: { revokedAt, replacedBySessionId: 'next-session-id' } });
  });
});
