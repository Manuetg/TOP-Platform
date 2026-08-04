import { InvalidCredentialsError, InvalidLoginInputError, LoginUseCase, UserDisabledError } from './login.use-case';
import type { AccessTokenIssuer } from '../domain/access-token-issuer';
import type { AuthenticationRepository } from '../domain/authentication.repository';
import { MembershipRole } from '../domain/membership-role.enum';
import type { MembershipRepository } from '../domain/membership.repository';
import type { PasswordHasher } from '../domain/password-hasher';
import { User } from '../domain/user.entity';
import { UserBusinessMembership } from '../domain/user-business-membership.entity';
import { UserStatus } from '../domain/user-status.enum';
import type { RefreshSessionRepository } from '../domain/refresh-session.repository';
import type { RefreshTokenExpiration, RefreshTokenGenerator, RefreshTokenHasher } from '../domain/refresh-token';
import { RefreshSession } from '../domain/refresh-session.entity';

const user = (status = UserStatus.ACTIVE): User => User.create({ id: '11111111-1111-4111-8111-111111111111', email: 'user@example.com', status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') });
const membership = (businessId: string, role: MembershipRole): UserBusinessMembership => UserBusinessMembership.create({ id: businessId, userId: user().id, businessId, role, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') });

describe('LoginUseCase', () => {
  const findForLoginByEmail: jest.MockedFunction<AuthenticationRepository['findForLoginByEmail']> = jest.fn();
  const verify: jest.MockedFunction<PasswordHasher['verify']> = jest.fn();
  const findByUserId: jest.MockedFunction<MembershipRepository['findByUserId']> = jest.fn();
  const issue: jest.MockedFunction<AccessTokenIssuer['issue']> = jest.fn();
  const authenticationRepository: AuthenticationRepository = { findForLoginByEmail };
  const passwordHasher: PasswordHasher = { hash: jest.fn(), verify };
  const membershipRepository: MembershipRepository = { findByUserAndBusiness: jest.fn(), findByUserId, create: jest.fn() };
  const tokenIssuer: AccessTokenIssuer = { issue };
  const create: jest.MockedFunction<RefreshSessionRepository['create']> = jest.fn();
  const generate: jest.MockedFunction<RefreshTokenGenerator['generate']> = jest.fn();
  const hash: jest.MockedFunction<RefreshTokenHasher['hash']> = jest.fn();
  const expiresAt: jest.MockedFunction<RefreshTokenExpiration['expiresAt']> = jest.fn();
  const sessions: RefreshSessionRepository = { create, findByTokenHash: jest.fn(), rotate: jest.fn() };
  const generator: RefreshTokenGenerator = { generate };
  const refreshHasher: RefreshTokenHasher = { hash };
  const expiration: RefreshTokenExpiration = { expiresAt };
  const useCase = new LoginUseCase(authenticationRepository, passwordHasher, membershipRepository, tokenIssuer, sessions, generator, refreshHasher, expiration);

  beforeEach(() => {
    jest.resetAllMocks();
    findForLoginByEmail.mockResolvedValue({ user: user(), passwordHash: 'hash' });
    verify.mockResolvedValue(true);
    findByUserId.mockResolvedValue([]);
    issue.mockResolvedValue({ token: 'jwt-token', expiresIn: 900 });
    generate.mockReturnValue('refresh-token');
    hash.mockImplementation((token) => `hash:${token}`);
    expiresAt.mockReturnValue(new Date('2026-02-01'));
    create.mockResolvedValue(RefreshSession.create({ id: 'session', userId: user().id, tokenHash: 'hash:refresh-token', expiresAt: new Date('2026-02-01'), revokedAt: null, replacedBySessionId: null, createdAt: new Date(), updatedAt: new Date() }));
  });

  it('autentica, normaliza email, emite Bearer y retorna membresías públicas', async () => {
    findByUserId.mockResolvedValue([membership('business-a', MembershipRole.OWNER), membership('business-b', MembershipRole.VIEWER)]);

    await expect(useCase.execute({ email: ' USER@EXAMPLE.COM ', password: 'contraseña' })).resolves.toEqual({
      accessToken: 'jwt-token', refreshToken: 'refresh-token', tokenType: 'Bearer', expiresIn: 900,
      user: { id: user().id, email: 'user@example.com', status: UserStatus.ACTIVE },
      memberships: [{ businessId: 'business-a', role: MembershipRole.OWNER }, { businessId: 'business-b', role: MembershipRole.VIEWER }],
    });
    expect(findForLoginByEmail).toHaveBeenCalledWith('user@example.com');
    expect(verify).toHaveBeenCalledWith('hash', 'contraseña');
    expect(findByUserId).toHaveBeenCalledWith(user().id);
    expect(issue).toHaveBeenCalledWith({ sub: user().id });
    expect(create).toHaveBeenCalledWith({ userId: user().id, tokenHash: 'hash:refresh-token', expiresAt: new Date('2026-02-01') });
  });

  it('permite iniciar sesión sin membresías', async () => {
    await expect(useCase.execute({ email: 'user@example.com', password: 'contraseña' })).resolves.toMatchObject({ memberships: [] });
  });

  it('rechaza entrada inválida', async () => {
    await expect(useCase.execute({ email: 'invalido', password: 'contraseña' })).rejects.toEqual(new InvalidLoginInputError('El email no es válido.'));
    await expect(useCase.execute({ email: 'user@example.com', password: '' })).rejects.toEqual(new InvalidLoginInputError('El email y la contraseña son obligatorios.'));
    await expect(useCase.execute({ email: undefined as never, password: 'contraseña' })).rejects.toEqual(new InvalidLoginInputError('El email y la contraseña son obligatorios.'));
    await expect(useCase.execute({ email: 'user@example.com', password: undefined as never })).rejects.toEqual(new InvalidLoginInputError('El email y la contraseña son obligatorios.'));
    await expect(useCase.execute({ email: 'user@example.com extra', password: 'contraseña' })).rejects.toEqual(new InvalidLoginInputError('El email no es válido.'));
    await expect(useCase.execute({ email: 'extra user@example.com', password: 'contraseña' })).rejects.toEqual(new InvalidLoginInputError('El email no es válido.'));
    expect(findForLoginByEmail).not.toHaveBeenCalled();
  });

  it('usa el mismo mensaje para email inexistente y contraseña incorrecta', async () => {
    findForLoginByEmail.mockResolvedValueOnce(null);
    await expect(useCase.execute({ email: 'missing@example.com', password: 'contraseña' })).rejects.toEqual(new InvalidCredentialsError('Las credenciales son inválidas.'));
    expect(verify).toHaveBeenCalledWith(expect.stringMatching(/^\$argon2id\$/), 'contraseña');
    expect(findByUserId).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    verify.mockResolvedValueOnce(false);
    await expect(useCase.execute({ email: 'user@example.com', password: 'incorrecta' })).rejects.toEqual(new InvalidCredentialsError('Las credenciales son inválidas.'));
    expect(findByUserId).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('rechaza un usuario deshabilitado sin emitir token', async () => {
    findForLoginByEmail.mockResolvedValue({ user: user(UserStatus.DISABLED), passwordHash: 'hash' });
    await expect(useCase.execute({ email: 'user@example.com', password: 'contraseña' })).rejects.toEqual(new UserDisabledError('El usuario está deshabilitado.'));
    expect(verify).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('propaga errores inesperados de los puertos', async () => {
    issue.mockRejectedValueOnce(new Error('jwt failure'));
    await expect(useCase.execute({ email: 'user@example.com', password: 'contraseña' })).rejects.toThrow('jwt failure');
  });
});
