export interface AvailabilityConversationOption {
  option: number;
  resourceId: string;
  name: string;
}

export interface AvailabilityConversationContext {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  options?: AvailabilityConversationOption[];
}

export interface SelectionConversationContext {
  resourceId: string;
  resourceName: string;
}

export interface PricingConversationContext {
  ratePlanId: string;
  ratePlanName: string;
  currency: string;
  nights: number;
  totalAmountMinor: number;
}

export interface ContactConversationContext {
  contactId?: string;
  name: string;
}

export interface BookingConversationContext {
  bookingId: string;
  status: 'PENDING';
}

export interface ConversationBotContext {
  availability?: AvailabilityConversationContext;
  selection?: SelectionConversationContext;
  pricing?: PricingConversationContext;
  contact?: ContactConversationContext;
  booking?: BookingConversationContext;
}

// eslint-disable-next-line complexity
export function readConversationBotContext(value: unknown): ConversationBotContext {
  const root = record(value);
  const availability = record(root?.availability);
  if (!availability) return {};

  const result: ConversationBotContext = { availability: readAvailabilityContext(availability) };
  const selection = readSelectionContext(root?.selection);
  const pricing = readPricingContext(root?.pricing);
  const contact = readContactContext(root?.contact);
  const booking = readBookingContext(root?.booking);
  if (selection) result.selection = selection;
  if (pricing) result.pricing = pricing;
  if (contact) result.contact = contact;
  if (booking) result.booking = booking;
  return result;
}

export function withAvailabilityContext(context: AvailabilityConversationContext): ConversationBotContext {
  return { availability: { ...context } };
}

export function clearAvailabilityContext(): ConversationBotContext {
  return {};
}

export function clearSelectionAndPricing(context: ConversationBotContext): ConversationBotContext {
  const availability = readConversationBotContext(context).availability;
  return availability ? { availability } : {};
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readAvailabilityContext(value: Record<string, unknown>): AvailabilityConversationContext {
  const context: AvailabilityConversationContext = {};
  if (typeof value.checkIn === 'string') context.checkIn = value.checkIn;
  if (typeof value.checkOut === 'string') context.checkOut = value.checkOut;
  if (typeof value.guests === 'number' && Number.isInteger(value.guests) && value.guests > 0) context.guests = value.guests;
  const options = readAvailabilityOptions(value.options);
  if (options) context.options = options;
  return context;
}

function readAvailabilityOptions(value: unknown): AvailabilityConversationOption[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.flatMap((item) => {
    const option = record(item);
    return validAvailabilityOption(option) ? [{ option: option.option, resourceId: option.resourceId, name: option.name }] : [];
  });
  return options.length === value.length ? options : null;
}

function validAvailabilityOption(value: Record<string, unknown> | null): value is Record<string, unknown> & { option: number; resourceId: string; name: string } {
  return Boolean(value && typeof value.option === 'number' && Number.isInteger(value.option) && value.option > 0 && typeof value.resourceId === 'string' && value.resourceId && typeof value.name === 'string' && value.name);
}

function readSelectionContext(value: unknown): SelectionConversationContext | null {
  const selection = record(value);
  if (!selection || typeof selection.resourceId !== 'string' || !selection.resourceId || typeof selection.resourceName !== 'string' || !selection.resourceName) return null;
  return { resourceId: selection.resourceId, resourceName: selection.resourceName };
}

function readPricingContext(value: unknown): PricingConversationContext | null {
  const pricing = record(value);
  if (!pricing || !hasPricingIdentity(pricing) || !hasPositiveInteger(pricing.nights) || !hasSafeAmount(pricing.totalAmountMinor)) return null;
  return { ratePlanId: pricing.ratePlanId, ratePlanName: pricing.ratePlanName, currency: pricing.currency, nights: pricing.nights, totalAmountMinor: pricing.totalAmountMinor };
}

function readContactContext(value: unknown): ContactConversationContext | null {
  const contact = record(value);
  if (!contact || typeof contact.name !== 'string' || contact.name.trim().length < 2) return null;
  if (contact.contactId !== undefined && (typeof contact.contactId !== 'string' || !contact.contactId)) return null;
  return { ...(typeof contact.contactId === 'string' ? { contactId: contact.contactId } : {}), name: contact.name };
}

function readBookingContext(value: unknown): BookingConversationContext | null {
  const booking = record(value);
  if (!booking || typeof booking.bookingId !== 'string' || !booking.bookingId || booking.status !== 'PENDING') return null;
  return { bookingId: booking.bookingId, status: 'PENDING' };
}

function hasPricingIdentity(value: Record<string, unknown>): value is Record<string, unknown> & { ratePlanId: string; ratePlanName: string; currency: string } {
  return typeof value.ratePlanId === 'string' && Boolean(value.ratePlanId) && typeof value.ratePlanName === 'string' && Boolean(value.ratePlanName) && typeof value.currency === 'string' && Boolean(value.currency);
}

function hasPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function hasSafeAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
