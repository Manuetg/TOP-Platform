import { CreateMembershipUseCase, InvalidMembershipInputError, MembershipAlreadyExistsError, MembershipNotFoundError } from './create-membership.use-case';
import { MembershipRole } from '../domain/membership-role.enum';
import { UserBusinessMembership } from '../domain/user-business-membership.entity';
import type { BusinessLookup, MembershipRepository, UserLookup } from '../domain/membership.repository';

const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const membership = (role = MembershipRole.OWNER): UserBusinessMembership => UserBusinessMembership.create({ id: '33333333-3333-4333-8333-333333333333', userId, businessId, role, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') });

describe('CreateMembershipUseCase', () => {
  const userExists: jest.MockedFunction<UserLookup['exists']> = jest.fn();
  const businessExists: jest.MockedFunction<BusinessLookup['exists']> = jest.fn();
  const findByUserAndBusiness: jest.MockedFunction<MembershipRepository['findByUserAndBusiness']> = jest.fn();
  const createMembership: jest.MockedFunction<MembershipRepository['create']> = jest.fn();
  const repository: MembershipRepository = { findByUserAndBusiness, create: createMembership };
  const users: UserLookup = { exists: userExists };
  const businesses: BusinessLookup = { exists: businessExists };
  const useCase = new CreateMembershipUseCase(repository, users, businesses);
  beforeEach(() => { jest.resetAllMocks(); userExists.mockResolvedValue(true); businessExists.mockResolvedValue(true); findByUserAndBusiness.mockResolvedValue(null); createMembership.mockImplementation((data: { userId: string; businessId: string; role: MembershipRole }) => Promise.resolve(membership(data.role))); });
  it.each(Object.values(MembershipRole))('crea una membresía %s con llamadas exactas', async (role) => { const result = await useCase.execute({ userId, businessId, role }); expect(userExists).toHaveBeenCalledWith(userId); expect(businessExists).toHaveBeenCalledWith(businessId); expect(findByUserAndBusiness).toHaveBeenCalledWith(userId, businessId); expect(createMembership).toHaveBeenCalledWith({ userId, businessId, role }); expect(result).toMatchObject({ userId, businessId, role }); });
  it('rechaza UUID de User inválido', async () => { await expect(useCase.execute({ userId: 'invalido', businessId, role: MembershipRole.OWNER })).rejects.toEqual(new InvalidMembershipInputError('El identificador de usuario no es válido.')); });
  it('rechaza UUID de Business inválido', async () => { await expect(useCase.execute({ userId, businessId: 'invalido', role: MembershipRole.OWNER })).rejects.toEqual(new InvalidMembershipInputError('El identificador de negocio no es válido.')); });
  it('rechaza un rol inválido', async () => { const invalidRole = 'INVALID' as MembershipRole; await expect(useCase.execute({ userId, businessId, role: invalidRole })).rejects.toEqual(new InvalidMembershipInputError('El rol de membresía no es válido.')); });
  it('rechaza User, Business y duplicado', async () => { userExists.mockResolvedValueOnce(false); await expect(useCase.execute({ userId, businessId, role: MembershipRole.OWNER })).rejects.toEqual(new MembershipNotFoundError('El usuario no existe.')); userExists.mockResolvedValue(true); businessExists.mockResolvedValueOnce(false); await expect(useCase.execute({ userId, businessId, role: MembershipRole.OWNER })).rejects.toEqual(new MembershipNotFoundError('El negocio no existe.')); businessExists.mockResolvedValue(true); findByUserAndBusiness.mockResolvedValueOnce(membership()); await expect(useCase.execute({ userId, businessId, role: MembershipRole.OWNER })).rejects.toEqual(new MembershipAlreadyExistsError('La membresía ya existe.')); });
  it('propaga errores inesperados', async () => { createMembership.mockRejectedValueOnce(new Error('db failure')); await expect(useCase.execute({ userId, businessId, role: MembershipRole.OWNER })).rejects.toThrow('db failure'); });
});
