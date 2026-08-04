import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
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
});
