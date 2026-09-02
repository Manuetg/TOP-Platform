import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { Prisma } from '@prisma/client';
import { UserEmailConflictError } from '../domain/user.repository';
import { PrismaIdentityService } from './prisma-identity.service';
import { PrismaUserRepository } from './prisma-user.repository';

describe('PrismaUserRepository', () => {
  it('persiste exclusivamente el nuevo estado al deshabilitar', async () => {
    const updatedAt = new Date('2026-08-04T12:00:00.000Z');
    const prisma = new PrismaIdentityService();
    const update = jest.spyOn(prisma.user, 'update').mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
      status: UserStatus.DISABLED,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt,
    });
    const repository = new PrismaUserRepository(prisma);
    const user = User.create({ id: '11111111-1111-4111-8111-111111111111', email: 'user@example.com', status: UserStatus.DISABLED, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') });

    await expect(repository.update(user)).resolves.toMatchObject({ id: user.id, email: user.email, status: UserStatus.DISABLED, updatedAt });
    expect(update).toHaveBeenCalledWith({ where: { id: user.id }, data: { status: UserStatus.DISABLED } });
  });
  it('persiste exclusivamente el email y mapea el conflicto unique', async () => {
    const prisma = new PrismaIdentityService();
    const update = jest.spyOn(prisma.user, 'update').mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', email: 'new@example.com', status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01') });
    const repository = new PrismaUserRepository(prisma);
    const changed = User.create({ id: '11111111-1111-4111-8111-111111111111', email: 'new@example.com', status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01') });
    await expect(repository.updateEmail(changed)).resolves.toMatchObject({ email: 'new@example.com', status: UserStatus.ACTIVE });
    expect(update).toHaveBeenCalledWith({ where: { id: changed.id }, data: { email: changed.email } });
    update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.19.3' }));
    await expect(repository.updateEmail(changed)).rejects.toEqual(new UserEmailConflictError('El email ya está registrado.'));
    const unrelated = new Prisma.PrismaClientKnownRequestError('foreign key', { code: 'P2003', clientVersion: '6.19.3' });
    update.mockRejectedValueOnce(unrelated);
    await expect(repository.updateEmail(changed)).rejects.toBe(unrelated);
  });
});
