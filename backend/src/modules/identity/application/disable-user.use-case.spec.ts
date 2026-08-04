import { DisableUserUseCase, InvalidUserIdError, UserNotFoundError } from './disable-user.use-case';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';

const id = '11111111-1111-4111-8111-111111111111';
const user = (status: UserStatus): User => User.create({ id, email: 'user@example.com', status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });

describe('DisableUserUseCase', () => {
  const findById = jest.fn(); const update = jest.fn();
  const useCase = new DisableUserUseCase({ findById }, { update });
  beforeEach(() => { jest.resetAllMocks(); findById.mockResolvedValue(user(UserStatus.ACTIVE)); update.mockImplementation((value: User) => Promise.resolve(value)); });
  it('deshabilita un usuario activo con persistencia exacta', async () => {
    await expect(useCase.execute(id)).resolves.toMatchObject({ id, status: UserStatus.DISABLED });
    expect(findById).toHaveBeenCalledWith(id); expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: UserStatus.DISABLED }));
  });
  it('es idempotente si ya está deshabilitado', async () => { findById.mockResolvedValue(user(UserStatus.DISABLED)); await expect(useCase.execute(id)).resolves.toMatchObject({ status: UserStatus.DISABLED }); expect(update).not.toHaveBeenCalled(); });
  it('rechaza UUID inválido y usuario inexistente', async () => {
    await expect(useCase.execute('invalid')).rejects.toEqual(new InvalidUserIdError('El identificador del usuario no es válido.'));
    findById.mockResolvedValue(null); await expect(useCase.execute(id)).rejects.toEqual(new UserNotFoundError('El usuario no existe.'));
  });
});
