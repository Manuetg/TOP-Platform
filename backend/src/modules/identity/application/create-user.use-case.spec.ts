import { CreateUserUseCase, InvalidUserInputError, UserAlreadyExistsError } from './create-user.use-case';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';

const user = (email: string): User => User.create({ id: '00000000-0000-4000-8000-000000000001', email, status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });

describe('CreateUserUseCase', () => {
  const repository = { findByEmail: jest.fn<Promise<User | null>, [string]>(), create: jest.fn<Promise<User>, [{ email: string; passwordHash: string }]>(), updateEmail: jest.fn<Promise<User>, [User]>() };
  const hasher = { hash: jest.fn<Promise<string>, [string]>(), verify: jest.fn() };
  const useCase = new CreateUserUseCase(repository, hasher);
  beforeEach(() => { jest.resetAllMocks(); repository.findByEmail.mockResolvedValue(null); hasher.hash.mockResolvedValue('hash'); repository.create.mockImplementation((data) => Promise.resolve(user(data.email))); });

  it('crea un usuario ACTIVE y normaliza email sin alterar puntos ni alias', async () => {
    const result = await useCase.execute({ email: '  Propietario+demo.Nombre@Ejemplo.COM ', password: 'contraseña válida' });
    expect(result).toMatchObject({ email: 'propietario+demo.nombre@ejemplo.com', status: UserStatus.ACTIVE });
    expect(hasher.hash).toHaveBeenCalledWith('contraseña válida');
    expect(repository.create).toHaveBeenCalledWith({ email: 'propietario+demo.nombre@ejemplo.com', passwordHash: 'hash' });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });
  it.each([['', 'El email es obligatorio.'], [undefined, 'El email es obligatorio.'], ['invalido', 'El email no es válido.']])('rechaza email inválido', async (email, message) => {
    await expect(useCase.execute({ email: email as string, password: 'contraseña válida' })).rejects.toEqual(new InvalidUserInputError(message));
  });
  it.each([['x'.repeat(11), false], ['x'.repeat(12), true], ['x'.repeat(128), true], ['x'.repeat(129), false], ['contraseña ñ válida', true]])('valida longitudes y Unicode', async (password, valid) => {
    const execution = useCase.execute({ email: 'user@example.com', password });
    if (valid) await expect(execution).resolves.toBeInstanceOf(User);
    else await expect(execution).rejects.toEqual(new InvalidUserInputError('La contraseña debe tener entre 12 y 128 caracteres.'));
  });
  it('rechaza email duplicado', async () => { repository.findByEmail.mockResolvedValue(user('user@example.com')); await expect(useCase.execute({ email: 'USER@example.com', password: 'contraseña válida' })).rejects.toEqual(new UserAlreadyExistsError('El email ya está registrado.')); expect(hasher.hash).not.toHaveBeenCalled(); });
  it('propaga fallos de hash y persistencia', async () => { hasher.hash.mockRejectedValueOnce(new Error('hash failed')); await expect(useCase.execute({ email: 'a@b.com', password: 'contraseña válida' })).rejects.toThrow('hash failed'); hasher.hash.mockResolvedValueOnce('hash'); repository.create.mockRejectedValueOnce(new Error('db failed')); await expect(useCase.execute({ email: 'a@b.com', password: 'contraseña válida' })).rejects.toThrow('db failed'); });
});
