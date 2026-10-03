import { UpdateUserUseCase, InvalidUserUpdateError, UpdateUserForbiddenError, UpdateUserNotFoundError, UserEmailChangeUnavailableError } from './update-user.use-case';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';

const id = '11111111-1111-4111-8111-111111111111';
const user = (email = 'user@example.com', status = UserStatus.ACTIVE): User => User.create({ id, email, status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });

describe('UpdateUserUseCase', () => {
  const findById = jest.fn<Promise<User | null>, [string]>();
  const useCase = new UpdateUserUseCase({ findById });
  beforeEach(() => { jest.resetAllMocks(); findById.mockResolvedValue(user()); });
  it.each(['new@example.com', ' Nuevo+Demo.Nombre@Ejemplo.COM ', 'taken@example.com'])('rechaza todo cambio efectivo sin consultar cuentas ajenas: %s', async (email) => {
    const current = user();
    findById.mockResolvedValue(current);
    await expect(useCase.execute({ id, actorUserId: id, email })).rejects.toEqual(new UserEmailChangeUnavailableError());
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith(id);
    expect(current.email).toBe('user@example.com');
    expect(current.updatedAt).toEqual(new Date('2026-01-01'));
  });
  it('devuelve la misma identidad en un no-op normalizado sin modificar versión ni datos protegidos', async () => {
    const current = User.create({ id, email: 'demo.nombre+alias@example.com', displayName: 'Nombre vigente', username: 'Alias', phone: '+595981123456', avatarId: 'leaf', birthYear: 1990, emailVerifiedAt: new Date('2026-01-02'), status: UserStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
    findById.mockResolvedValue(current);
    await expect(useCase.execute({ id, actorUserId: id, email: ' DEMO.Nombre+ALIAS@EXAMPLE.COM ' })).resolves.toBe(current);
    expect(current.updatedAt).toEqual(new Date('2026-01-01'));
    expect(current.emailVerifiedAt).toEqual(new Date('2026-01-02'));
    expect(current.phone).toBe('+595981123456');
  });
  it.each([[{ id: 'invalid', actorUserId: id, email: 'a@b.com' }, 'El identificador del usuario no es válido.'], [{ id, actorUserId: id }, 'El email es obligatorio.'], [{ id, actorUserId: id, email: ' ' }, 'El email es obligatorio.'], [{ id, actorUserId: id, email: 'invalid' }, 'El email no es válido.']])('rechaza entradas inválidas', async (input, message) => { await expect(useCase.execute(input)).rejects.toEqual(new InvalidUserUpdateError(message)); });
  it('informa inexistente sin buscar el correo solicitado', async () => { findById.mockResolvedValueOnce(null); await expect(useCase.execute({ id, actorUserId: id, email: 'a@b.com' })).rejects.toEqual(new UpdateUserNotFoundError('El usuario no existe.')); });
  it('rechaza actualizar otro User antes de consultar su existencia', async () => { await expect(useCase.execute({ id, actorUserId: '22222222-2222-4222-8222-222222222222', email: 'new@example.com' })).rejects.toEqual(new UpdateUserForbiddenError('Solo se permite actualizar el propio usuario.')); expect(findById).not.toHaveBeenCalled(); });
  it.each(['new@example.com', ' DISABLED@EXAMPLE.COM '])('rechaza un User DISABLED incluso en no-op: %s', async (email) => { findById.mockResolvedValue(user('disabled@example.com', UserStatus.DISABLED)); await expect(useCase.execute({ id, actorUserId: id, email })).rejects.toEqual(new UpdateUserForbiddenError('Un usuario deshabilitado no puede actualizarse.')); });
  it('no quita puntos ni alias + al evaluar un no-op', async () => {
    findById.mockResolvedValue(user('demo.name+alias@example.com'));
    await expect(useCase.execute({ id, actorUserId: id, email: 'demoname+alias@example.com' })).rejects.toBeInstanceOf(UserEmailChangeUnavailableError);
    await expect(useCase.execute({ id, actorUserId: id, email: 'demo.name@example.com' })).rejects.toBeInstanceOf(UserEmailChangeUnavailableError);
  });
  it('propaga un fallo de lookup sin éxito ni cambio de correo', async () => { const error = new Error('fallo de lectura'); findById.mockRejectedValue(error); await expect(useCase.execute({ id, actorUserId: id, email: 'new@example.com' })).rejects.toBe(error); });
});
