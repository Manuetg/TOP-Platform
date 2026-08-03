import { MembershipRole } from '../../../src/modules/identity/domain/membership-role.enum';
import { UserBusinessMembership } from '../../../src/modules/identity/domain/user-business-membership.entity';
const users = new Set<string>(); const businesses = new Set<string>(); const memberships = new Map<string, UserBusinessMembership>();
const key = (userId: string, businessId: string): string => `${userId}:${businessId}`;
export const membershipRepositoryFake = { findByUserAndBusiness: (userId: string, businessId: string): Promise<UserBusinessMembership | null> => Promise.resolve(memberships.get(key(userId, businessId)) ?? null), create: ({ userId, businessId, role }: { userId: string; businessId: string; role: MembershipRole }): Promise<UserBusinessMembership> => { const now = new Date(); const item = UserBusinessMembership.create({ id: `membership-${memberships.size + 1}`, userId, businessId, role, createdAt: now, updatedAt: now }); memberships.set(key(userId, businessId), item); return Promise.resolve(item); } };
export const userLookupFake = { exists: (id: string): Promise<boolean> => Promise.resolve(users.has(id)) };
export const businessLookupFake = { exists: (id: string): Promise<boolean> => Promise.resolve(businesses.has(id)) };
export const addUserFake = (id: string): void => { users.add(id); }; export const addBusinessFake = (id: string): void => { businesses.add(id); }; export const membershipCount = (): number => memberships.size; export const resetMembershipFakes = (): void => { users.clear(); businesses.clear(); memberships.clear(); };
