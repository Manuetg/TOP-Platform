import { UserBusinessMembership } from './user-business-membership.entity';
import { MembershipRole } from './membership-role.enum';
export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
export const USER_LOOKUP = Symbol('USER_LOOKUP');
export const BUSINESS_LOOKUP = Symbol('BUSINESS_LOOKUP');
export interface MembershipRepository { findByUserAndBusiness(userId: string, businessId: string): Promise<UserBusinessMembership | null>; create(data: { userId: string; businessId: string; role: MembershipRole }): Promise<UserBusinessMembership>; }
export interface UserLookup { exists(id: string): Promise<boolean>; }
export interface BusinessLookup { exists(id: string): Promise<boolean>; }
