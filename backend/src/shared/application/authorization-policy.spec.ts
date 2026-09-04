import { MembershipRole } from '../../modules/identity/domain/membership-role.enum';
import { AuthorizationPolicy, AuthorizationScope, Capability, capabilityScopes } from './authorization-policy';

const allRoles = Object.values(MembershipRole);
const expected: Readonly<Record<Capability, readonly MembershipRole[]>> = {
  [Capability.BUSINESS_READ]: allRoles, [Capability.BUSINESS_UPDATE]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.BUSINESS_ARCHIVE]: [MembershipRole.OWNER],
  [Capability.MEMBERSHIP_CREATE]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.MEMBERSHIP_ASSIGN_OWNER]: [MembershipRole.OWNER], [Capability.MEMBERSHIP_ASSIGN_ADMIN]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.MEMBERSHIP_ASSIGN_RECEPTIONIST]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.MEMBERSHIP_ASSIGN_VIEWER]: [MembershipRole.OWNER, MembershipRole.ADMIN],
  [Capability.CONTACT_READ]: allRoles, [Capability.CONTACT_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST],
  [Capability.RESOURCE_READ]: allRoles, [Capability.RESOURCE_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.RESOURCE_IMAGE_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.RESOURCE_AMENITY_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.BUSINESS_AMENITY_CREATE]: [MembershipRole.OWNER, MembershipRole.ADMIN],
  [Capability.AVAILABILITY_READ]: allRoles, [Capability.AVAILABILITY_RULES_READ]: allRoles, [Capability.AVAILABILITY_RULES_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.AVAILABILITY_BLOCK_READ]: allRoles, [Capability.AVAILABILITY_BLOCK_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST],
  [Capability.PRICING_READ]: allRoles, [Capability.PRICING_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN], [Capability.PRICING_CALCULATE]: allRoles, [Capability.PRICING_OVERRIDE_CALCULATE]: [MembershipRole.OWNER, MembershipRole.ADMIN],
  [Capability.BOOKING_READ]: allRoles, [Capability.BOOKING_WRITE]: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST], [Capability.BOOKING_CANCEL]: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST],
  [Capability.PAYMENT_READ]: allRoles, [Capability.PAYMENT_RECORD]: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST],
};

describe('AuthorizationPolicy', () => {
  const policy = new AuthorizationPolicy();

  it.each(Object.values(Capability))('aplica exhaustivamente la matriz para %s', (capability) => {
    for (const role of allRoles) expect(policy.isAllowed(role, capability)).toBe(expected[capability].includes(role));
  });

  it('deniega por defecto una capability desconocida', () => {
    expect(policy.isAllowed(MembershipRole.OWNER, 'unknown.capability')).toBe(false);
  });

  it('mantiene las capabilities del catálogo en scope BUSINESS', () => {
    expect(Object.values(capabilityScopes)).toEqual(Object.values(Capability).map(() => AuthorizationScope.BUSINESS));
  });
});
