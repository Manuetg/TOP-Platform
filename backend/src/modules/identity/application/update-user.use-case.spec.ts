import { UpdateUserUseCase, InvalidUserUpdateError, UpdateUserNotFoundError, UserEmailAlreadyExistsError } from './update-user.use-case';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';

const id = '11111111-1111-4111-8111-111111111111';
const user = (email = 'user@example.com', status = UserStatus.ACTIVE): User => User.create({ id, email, status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });

describe('UpdateUserUseCase', () => {
  const findById = jest.fn<Promise<User | null>, [string]>();
  const findByEmail = jest.fn<Promise<User | null>, [string]>();
  const updateEmail = jest.fn<Promise<User>, [User]>();
  const useCase = new UpdateUserUseCase({ findById }, { findByEmail, create: jest.fn(), updateEmail });
  beforeEach(() => { jest.resetAllMocks(); findById.mockResolvedValue(user()); findByEmail.mockResolvedValue(null); updateEmail.mockImplementation((value) => Promise.resolve(value)); });
  it('normaliza, conserva alias y actualiza solo el email', async () => {
    await expect(useCase.execute({ id, email: ' Nuevo+Demo.Nombre@Ejemplo.COM ' })).resolves.toMatchObject({ email: 'nuevo+demo.nombre@ejemplo.com', status: UserStatus.ACTIVE });
    expect(updateEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'nuevo+demo.nombre@ejemplo.com' }));
  });
  it('es idempotente para el mismo email', async () => { const current = user(); findById.mockResolvedValue(current); await expect(useCase.execute({ id, email: ' USER@EXAMPLE.COM ' })).resolves.toBe(current); expect(updateEmail).not.toHaveBeenCalled(); });
  it.each([[{ id: 'invalid', email: 'a@b.com' }, 'El identificador del usuario no es válido.'], [{ id }, 'El email es obligatorio.'], [{ id, email: ' ' }, 'El email es obligatorio.'], [{ id, email: 'invalid' }, 'El email no es válido.']])('rechaza entradas inválidas', async (input, message) => { await expect(useCase.execute(input)).rejects.toEqual(new InvalidUserUpdateError(message)); });
  it('informa inexistente y duplicado', async () => { findById.mockResolvedValueOnce(null); await expect(useCase.execute({ id, email: 'a@b.com' })).rejects.toEqual(new UpdateUserNotFoundError('El usuario no existe.')); findByEmail.mockResolvedValueOnce(User.create({ id: '22222222-2222-4222-8222-222222222222', email: 'other@example.com', status: UserStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() })); await expect(useCase.execute({ id, email: 'a@b.com' })).rejects.toEqual(new UserEmailAlreadyExistsError('El email ya está registrado.')); });
  it('permite actualizar un usuario DISABLED', async () => { findById.mockResolvedValue(user('disabled@example.com', UserStatus.DISABLED)); await expect(useCase.execute({ id, email: 'new@example.com' })).resolves.toMatchObject({ status: UserStatus.DISABLED }); });
});
