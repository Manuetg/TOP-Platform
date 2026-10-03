import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { GetUserProfileUseCase } from './get-user-profile.use-case';
import { UpdateUserProfileUseCase } from './update-user-profile.use-case';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileInputError, UserProfileNotFoundError } from './user-profile.errors';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const auditReason = 'Actualización del perfil por su titular.';
const currentUser = (displayName: string | null = 'Ana Pérez', status = UserStatus.ACTIVE): User => User.create({
  id, email: 'ana@example.test', displayName, emailVerifiedAt: new Date('2026-09-01T12:00:00Z'), status,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-09-01'),
});

describe('Edición auditada del propio perfil personal', () => {
  const findById = jest.fn<Promise<User | null>, [string]>();
  const changeDisplayName = jest.fn();
  const updateProfile = new UpdateUserProfileUseCase(new GetUserProfileUseCase({ findById }), { changeDisplayName });
  const input = { id, actorUserId: id, displayName: '  María José  ', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' };

  beforeEach(() => {
    jest.resetAllMocks();
    findById.mockResolvedValue(currentUser());
    changeDisplayName.mockResolvedValue(currentUser('María José'));
  });
  afterEach(() => jest.useRealTimers());

  it('recorta nombre y alias y entrega actor, versión y motivo automático al puerto transaccional', async () => {
    const persisted = currentUser('María José').updateEmail('vigente@example.test');
    changeDisplayName.mockResolvedValueOnce(persisted);
    await expect(updateProfile.execute({ ...input, birthYear: 1990, username: '  maria.jose  ', phone: '+595981123456', avatarId: 'leaf' })).resolves.toBe(persisted);
    expect(changeDisplayName).toHaveBeenCalledWith({
      id, actorUserId: id, displayName: 'María José', reason: auditReason,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt), birthYear: 1990, username: 'maria.jose', phone: '+595981123456', avatarId: 'leaf',
    });
  });

  it('no exige motivo al cliente y omite claves para preservar los opcionales ausentes', async () => {
    await updateProfile.execute(input);
    expect(changeDisplayName).toHaveBeenCalledWith({
      id, actorUserId: id, displayName: 'María José', reason: auditReason,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
    });
  });

  it('no toma un motivo inyectado por el cliente como motivo de auditoría', async () => {
    const injectedInput = { ...input, reason: 'Motivo controlado por el cliente' };
    await updateProfile.execute(injectedInput);
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ reason: auditReason }));
  });

  it('entrega null explícito para borrar cada dato opcional', async () => {
    await updateProfile.execute({ ...input, birthYear: null, username: null, phone: null, avatarId: null });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ birthYear: null, username: null, phone: null, avatarId: null }));
  });

  it.each(['A', 'Á'.repeat(120), ` ${'A'.repeat(120)} `])('admite los límites del nombre recortado', async (displayName) => {
    await updateProfile.execute({ ...input, displayName });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ displayName: displayName.trim() }));
  });
  it.each([undefined, null, 12, true, [], {}, '', ' \t\n ', 'A'.repeat(121)])('rechaza nombres ausentes o fuera del rango', async (displayName) => {
    await expect(updateProfile.execute({ ...input, displayName })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it.each([1, new Date().getUTCFullYear()])('admite el año entero %s sin exigir fecha de nacimiento ni edad mínima', async (birthYear) => {
    await updateProfile.execute({ ...input, birthYear });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ birthYear }));
  });
  it('calcula el límite superior del año con el reloj UTC vigente', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-31T23:59:59.999Z'));
    await expect(updateProfile.execute({ ...input, birthYear: 2027 })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    await updateProfile.execute({ ...input, birthYear: 2027 });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ birthYear: 2027 }));
  });
  it.each([0, -1, 1990.5, new Date().getUTCFullYear() + 1, Number.MAX_SAFE_INTEGER, NaN, Infinity, '1990', true, [], {}, ''])('rechaza año inválido %s sin persistir', async (birthYear) => {
    await expect(updateProfile.execute({ ...input, birthYear })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it.each(['A', 'Á'.repeat(50), ` ${'a'.repeat(50)} `, 'Ana Pérez'])('admite alias de perfil recortado sin convertirlo en credencial', async (username) => {
    await updateProfile.execute({ ...input, username });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ username: username.trim() }));
  });
  it.each(['a'.repeat(51), 123, true, [], {}])('rechaza alias inválido %s sin persistir', async (username) => {
    await expect(updateProfile.execute({ ...input, username })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it.each(['+595981123456', '+14155552671'])('admite teléfono internacional posible %s', async (phone) => {
    await updateProfile.execute({ ...input, phone });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ phone }));
  });
  it.each(['0981123456', '595981123456', '+5959', '+999123456789', '+0123456789', '+14155552671 ext 1', '+14155552671123456', 123, true, [], {}])('rechaza teléfono ajeno a E.164 o imposible %s', async (phone) => {
    await expect(updateProfile.execute({ ...input, phone })).rejects.toBeInstanceOf(UserProfileInputError);
    expect(changeDisplayName).not.toHaveBeenCalled();
  });

  it.each(['', ' \t\n '])('normaliza alias y teléfono opcionales vacíos a null', async (value) => {
    await updateProfile.execute({ ...input, username: value, phone: value });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ username: null, phone: null }));
  });
  it('normaliza un teléfono internacional posible con separadores a E.164', async () => {
    await updateProfile.execute({ ...input, phone: ' +1 415 555 2671 ' });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ phone: '+14155552671' }));
  });

  it.each(['user', 'leaf', 'sun', 'mountain'])('admite avatar del catálogo %s', async (avatarId) => {
    await updateProfile.execute({ ...input, avatarId });
    expect(changeDisplayName).toHaveBeenCalledWith(expect.objectContaining({ avatarId }));
  });
  it.each(['', ' leaf ', 'USER', 'unknown', 'https://example.test/avatar.png', '../../private', 123, true, [], {}])('rechaza avatar fuera del catálogo %s', async (avatarId) => {
    await expect(updateProfile.execute({ ...input, avatarId })).rejects.toBeInstanceOf(UserProfileInputError);
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
  it('rechaza un perfil deshabilitado antes de guardar', async () => {
    findById.mockResolvedValueOnce(currentUser('Ana', UserStatus.DISABLED));
    await expect(updateProfile.execute(input)).rejects.toBeInstanceOf(UserProfileForbiddenError);
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
