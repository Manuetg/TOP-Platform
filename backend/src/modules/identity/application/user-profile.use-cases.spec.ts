import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { GetUserProfileUseCase } from './get-user-profile.use-case';
import { UpdateUserProfileUseCase } from './update-user-profile.use-case';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileInputError, UserProfileNotFoundError } from './user-profile.errors';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const currentUser = (displayName: string | null = 'Ana Pérez', status = UserStatus.ACTIVE): User => User.create({
  id, email: 'ana@example.test', displayName, emailVerifiedAt: new Date('2026-09-01T12:00:00Z'), status,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01'),
});

describe('Edición auditada del propio nombre personal', () => {
  const findById = jest.fn<Promise<User | null>, [string]>();
  const changeDisplayName = jest.fn();
  const updateProfile = new UpdateUserProfileUseCase(new GetUserProfileUseCase({ findById }), { changeDisplayName });
  const input = { id, actorUserId: id, displayName: '  María José  ', reason: '  Corregí mi nombre  ', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' };

  beforeEach(() => {
    jest.resetAllMocks();
    findById.mockResolvedValue(currentUser());
    changeDisplayName.mockResolvedValue(currentUser('María José'));
  });

  it('recorta nombre y motivo y entrega actor y versión al puerto transaccional', async () => {
    const persisted = currentUser('María José').updateEmail('vigente@example.test');
    changeDisplayName.mockResolvedValueOnce(persisted);
    await expect(updateProfile.execute(input)).resolves.toBe(persisted);
    expect(changeDisplayName).toHaveBeenCalledWith({ id, actorUserId: id, displayName: 'María José', reason: 'Corregí mi nombre', expectedUpdatedAt: new Date(input.expectedUpdatedAt) });
  });

  it.each(['A', 'á'.repeat(120), ` ${'A'.repeat(120)} `])('admite los límites del nombre recortado', async (displayName) => {
    await updateProfile.execute({ ...input, displayName });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ displayName: displayName.trim() }));
  });

  it.each(['A', 'A'.repeat(501)])('admite motivos no vacíos sin copiar límites de otros dominios', async (reason) => {
    await updateProfile.execute({ ...input, reason });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ reason }));
  });

  it.each([undefined, null, 12, {}, '', ' \t\n ', 'A'.repeat(121)])('rechaza nombres ausentes o fuera del rango', async (displayName) => {
    await expect(updateProfile.execute({ ...input, displayName })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 12, {}, '', ' \t\n '])('rechaza motivos ausentes o vacíos', async (reason) => {
    await expect(updateProfile.execute({ ...input, reason })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 12, {}, '', '2026-09-01', '2026-02-30T00:00:00.000Z', '2026-09-01T00:00:00Z', 'invalid'])('rechaza versiones que no corresponden al formato de updatedAt', async (expectedUpdatedAt) => {
    await expect(updateProfile.execute({ ...input, expectedUpdatedAt })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it('rechaza otra identidad antes de consultar el destino o guardar', async () => {
    await expect(updateProfile.execute({ ...input, id: otherId })).rejects.toBeInstanceOf(UserProfileForbiddenError);
    expect(findById).not.toHaveBeenCalled();
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it('deja al puerto decidir versiones desactualizadas incluso si el nombre coincide', async () => {
    const conflict = new UserProfileConflictError('stale');
    changeDisplayName.mockRejectedValueOnce(conflict);
    await expect(updateProfile.execute({ ...input, displayName: 'Ana Pérez', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })).rejects.toBe(conflict);
    expect(changeDisplayName).toHaveBeenCalledTimes(1);
  });

  it.each([new UserProfileNotFoundError('missing'), new UserProfileForbiddenError('disabled'), new Error('audit unavailable')])('propaga errores transaccionales sin anunciar éxito', async (error) => {
    changeDisplayName.mockRejectedValueOnce(error);
    await expect(updateProfile.execute(input)).rejects.toBe(error);
  });
});

describe('Lectura del propio perfil personal', () => {
  const findById = jest.fn<Promise<User | null>, [string]>();
  const getProfile = new GetUserProfileUseCase({ findById });

  beforeEach(() => {
    jest.resetAllMocks();
    findById.mockResolvedValue(currentUser());
  });

  it('consulta el perfil vigente en cada petición y permite un nombre legacy nulo', async () => {
    const first = currentUser();
    const latest = currentUser(null).updateEmail('actual@example.test');
    findById.mockResolvedValueOnce(first).mockResolvedValueOnce(latest);
    await expect(getProfile.execute({ id, actorUserId: id })).resolves.toBe(first);
    await expect(getProfile.execute({ id, actorUserId: id })).resolves.toBe(latest);
    expect(findById).toHaveBeenNthCalledWith(1, id);
    expect(findById).toHaveBeenNthCalledWith(2, id);
  });

  it('rechaza otro perfil antes de consultar su existencia', async () => {
    await expect(getProfile.execute({ id: otherId, actorUserId: id })).rejects.toBeInstanceOf(UserProfileForbiddenError);
    expect(findById).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: 'invalid', actorUserId: id }, UserProfileInputError],
    [{ id, actorUserId: 'invalid' }, UserProfileForbiddenError],
  ])('rechaza identificadores inválidos sin acceder al repositorio', async (input, error) => {
    await expect(getProfile.execute(input)).rejects.toBeInstanceOf(error);
    expect(findById).not.toHaveBeenCalled();
  });

  it('informa que el usuario propio no existe', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(getProfile.execute({ id, actorUserId: id })).rejects.toBeInstanceOf(UserProfileNotFoundError);
  });

  it('rechaza el estado DISABLED leído del repositorio', async () => {
    findById.mockResolvedValueOnce(currentUser('Ana', UserStatus.DISABLED));
    await expect(getProfile.execute({ id, actorUserId: id })).rejects.toBeInstanceOf(UserProfileForbiddenError);
  });

  it('propaga fallos de lectura sin informar un resultado exitoso', async () => {
    const error = new Error('read failed');
    findById.mockRejectedValueOnce(error);
    await expect(getProfile.execute({ id, actorUserId: id })).rejects.toBe(error);
  });
});
