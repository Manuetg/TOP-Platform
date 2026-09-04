import { MembershipRole } from '../../modules/identity/domain/membership-role.enum';

export enum AuthorizationScope {
  BUSINESS = 'BUSINESS',
  SELF = 'SELF',
  GLOBAL = 'GLOBAL',
  PUBLIC = 'PUBLIC',
  SYSTEM = 'SYSTEM',
}

export enum Capability {
  BUSINESS_READ = 'business.read',
  BUSINESS_UPDATE = 'business.update',
  BUSINESS_ARCHIVE = 'business.archive',
  MEMBERSHIP_CREATE = 'membership.create',
  MEMBERSHIP_ASSIGN_OWNER = 'membership.assign.owner',
  MEMBERSHIP_ASSIGN_ADMIN = 'membership.assign.admin',
  MEMBERSHIP_ASSIGN_RECEPTIONIST = 'membership.assign.receptionist',
  MEMBERSHIP_ASSIGN_VIEWER = 'membership.assign.viewer',
  CONTACT_READ = 'contact.read',
  CONTACT_WRITE = 'contact.write',
  RESOURCE_READ = 'resource.read',
  RESOURCE_WRITE = 'resource.write',
  RESOURCE_IMAGE_WRITE = 'resource.image.write',
  RESOURCE_AMENITY_WRITE = 'resource.amenity.write',
  BUSINESS_AMENITY_CREATE = 'business.amenity.create',
  AVAILABILITY_READ = 'availability.read',
  AVAILABILITY_RULES_READ = 'availability.rules.read',
  AVAILABILITY_RULES_WRITE = 'availability.rules.write',
  AVAILABILITY_BLOCK_READ = 'availability.block.read',
  AVAILABILITY_BLOCK_WRITE = 'availability.block.write',
  PRICING_READ = 'pricing.read',
  PRICING_WRITE = 'pricing.write',
  PRICING_CALCULATE = 'pricing.calculate',
  PRICING_OVERRIDE_CALCULATE = 'pricing.override.calculate',
  BOOKING_READ = 'booking.read',
  BOOKING_WRITE = 'booking.write',
  BOOKING_CANCEL = 'booking.cancel',
  PAYMENT_READ = 'payment.read',
  PAYMENT_RECORD = 'payment.record',
}

const allRoles = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST, MembershipRole.VIEWER] as const;
const ownerAdmin = [MembershipRole.OWNER, MembershipRole.ADMIN] as const;
const operational = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.RECEPTIONIST] as const;

export const capabilityScopes: Readonly<Record<Capability, AuthorizationScope>> = Object.freeze(
  Object.fromEntries(Object.values(Capability).map((capability) => [capability, AuthorizationScope.BUSINESS])) as Record<Capability, AuthorizationScope>,
);

const roleCapabilities: Readonly<Record<Capability, readonly MembershipRole[]>> = Object.freeze({
  [Capability.BUSINESS_READ]: allRoles,
  [Capability.BUSINESS_UPDATE]: ownerAdmin,
  [Capability.BUSINESS_ARCHIVE]: [MembershipRole.OWNER],
  [Capability.MEMBERSHIP_CREATE]: ownerAdmin,
  [Capability.MEMBERSHIP_ASSIGN_OWNER]: [MembershipRole.OWNER],
  [Capability.MEMBERSHIP_ASSIGN_ADMIN]: ownerAdmin,
  [Capability.MEMBERSHIP_ASSIGN_RECEPTIONIST]: ownerAdmin,
  [Capability.MEMBERSHIP_ASSIGN_VIEWER]: ownerAdmin,
  [Capability.CONTACT_READ]: allRoles,
  [Capability.CONTACT_WRITE]: operational,
  [Capability.RESOURCE_READ]: allRoles,
  [Capability.RESOURCE_WRITE]: ownerAdmin,
  [Capability.RESOURCE_IMAGE_WRITE]: ownerAdmin,
  [Capability.RESOURCE_AMENITY_WRITE]: ownerAdmin,
  [Capability.BUSINESS_AMENITY_CREATE]: ownerAdmin,
  [Capability.AVAILABILITY_READ]: allRoles,
  [Capability.AVAILABILITY_RULES_READ]: allRoles,
  [Capability.AVAILABILITY_RULES_WRITE]: ownerAdmin,
  [Capability.AVAILABILITY_BLOCK_READ]: allRoles,
  [Capability.AVAILABILITY_BLOCK_WRITE]: operational,
  [Capability.PRICING_READ]: allRoles,
  [Capability.PRICING_WRITE]: ownerAdmin,
  [Capability.PRICING_CALCULATE]: allRoles,
  [Capability.PRICING_OVERRIDE_CALCULATE]: ownerAdmin,
  [Capability.BOOKING_READ]: allRoles,
  [Capability.BOOKING_WRITE]: operational,
  [Capability.BOOKING_CANCEL]: operational,
  [Capability.PAYMENT_READ]: allRoles,
  [Capability.PAYMENT_RECORD]: operational,
});

export class AuthorizationPolicy {
  isAllowed(role: MembershipRole, capability: string): boolean {
    if (!Object.values(Capability).includes(capability as Capability)) return false;
    return roleCapabilities[capability as Capability].includes(role);
  }
}
