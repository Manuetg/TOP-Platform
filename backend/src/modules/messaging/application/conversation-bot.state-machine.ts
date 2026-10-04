import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationSessionState } from '../domain/conversation-session-state.enum';
import {
  clearAvailabilityContext,
  clearSelectionAndPricing,
  type AvailabilityConversationOption,
  type ConversationBotContext,
  readConversationBotContext,
  withAvailabilityContext,
} from './conversation-bot-context';
import { parseConversationDate } from './conversation-bot-date';

export type ConversationBotIntent =
  | 'CONSULT_AVAILABILITY'
  | 'CREATE_BOOKING'
  | 'MY_BOOKING'
  | 'HUMAN_HANDOFF'
  | 'UNKNOWN';

export interface AvailabilityQueryRequest {
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface AvailabilityOption {
  resourceId: string;
  name: string;
}

export interface AvailabilitySelectionRequest extends AvailabilityQueryRequest {
  resourceId: string;
  resourceName: string;
}

export interface PricingQuoteOption extends AvailabilitySelectionRequest {
  ratePlanId: string;
  ratePlanName: string;
  currency: string;
  nights: number;
  totalAmountMinor: number;
}

export interface ConversationContact {
  contactId: string;
  name: string;
}

export interface BookingConfirmationRequest {
  contactId: string | null;
  contactName: string;
  resourceId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface ConversationBotDecision {
  nextState: ConversationSessionState;
  response: string | null;
  changeModeToHuman: boolean;
  context: ConversationBotContext;
  availabilityRequest?: AvailabilityQueryRequest;
  availabilitySelectionRequest?: AvailabilitySelectionRequest;
  availabilityRefreshRequest?: AvailabilityQueryRequest;
  bookingConfirmationRequest?: BookingConfirmationRequest;
  bookingCreationRequest?: BookingConfirmationRequest;
}

interface ConversationBotInput {
  state: ConversationSessionState;
  mode: ConversationMode;
  text: string;
  businessName: string;
  businessToday: string;
  context?: ConversationBotContext;
  availabilityOptions?: readonly AvailabilityOption[];
  availabilitySelectionUnavailable?: boolean;
  availabilityRefreshed?: boolean;
  pricingUnavailable?: boolean;
  pricingQuote?: PricingQuoteOption;
  contact?: ConversationContact;
  bookingConfirmationResult?: {
    availabilityAvailable: boolean;
    pricingQuote?: PricingQuoteOption;
    pricingUnavailable?: boolean;
  };
}

export function decideConversationBotResponse(input: ConversationBotInput): ConversationBotDecision {
  if (input.mode === ConversationMode.HUMAN) return decision(input.state, null, input.context);

  const context = readConversationBotContext(input.context);
  const state = input.state === ConversationSessionState.HUMAN_HANDOFF
    ? ConversationSessionState.MAIN_MENU
    : input.state;
  const normalized = input.text.trim().toUpperCase();

  if (state === ConversationSessionState.PRICING_QUOTE && normalized === 'CANCELAR') {
    return decision(ConversationSessionState.MAIN_MENU, mainMenuMessage(), clearAvailabilityContext());
  }
  if (isAvailabilityState(state) && isCancel(input.text, state)) {
    return decision(ConversationSessionState.MAIN_MENU, mainMenuMessage(), clearAvailabilityContext());
  }

  return decideForState(state, input, context);
}

// eslint-disable-next-line complexity
function decideForState(state: ConversationSessionState, input: ConversationBotInput, context: ConversationBotContext): ConversationBotDecision {
  switch (state) {
    case ConversationSessionState.START:
      return decision(ConversationSessionState.MAIN_MENU, welcomeMessage(input.businessName), clearAvailabilityContext());
    case ConversationSessionState.MAIN_MENU:
      return fromMainMenu(input.text);
    case ConversationSessionState.AVAILABILITY_ASK_CHECK_IN:
      return askCheckIn(input, context);
    case ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT:
      return askCheckOut(input, context);
    case ConversationSessionState.AVAILABILITY_ASK_GUESTS:
      return askGuests(input, context, input.availabilityOptions);
    case ConversationSessionState.AVAILABILITY_RESULTS:
      return fromAvailabilityResults(input, context);
    case ConversationSessionState.PRICING_QUOTE:
      return fromPricingQuote(input, context);
    case ConversationSessionState.CONTACT_ASK_NAME:
      return fromContactName(input, context);
    case ConversationSessionState.BOOKING_CONFIRM:
      return fromBookingConfirmation(input, context);
    case ConversationSessionState.BOOKING_CREATED:
      return decision(ConversationSessionState.BOOKING_CREATED, 'Tu solicitud de reserva ya fue registrada.', context);
    default:
      return decision(ConversationSessionState.MAIN_MENU, mainMenuMessage(), clearAvailabilityContext());
  }
}

export function parseConversationBotIntent(text: string): ConversationBotIntent {
  const normalized = text.trim().toUpperCase();
  const intents: Record<string, ConversationBotIntent> = {
    '1': 'CONSULT_AVAILABILITY',
    CONSULT_AVAILABILITY: 'CONSULT_AVAILABILITY',
    AVAILABILITY: 'CONSULT_AVAILABILITY',
    '2': 'CREATE_BOOKING',
    CREATE_BOOKING: 'CREATE_BOOKING',
    BOOKING: 'CREATE_BOOKING',
    '3': 'MY_BOOKING',
    MY_BOOKING: 'MY_BOOKING',
    MY_RESERVATION: 'MY_BOOKING',
    '4': 'HUMAN_HANDOFF',
    HUMAN_HANDOFF: 'HUMAN_HANDOFF',
    HUMAN: 'HUMAN_HANDOFF',
  };
  return intents[normalized] ?? 'UNKNOWN';
}

function fromMainMenu(text: string): ConversationBotDecision {
  switch (parseConversationBotIntent(text)) {
    case 'CONSULT_AVAILABILITY':
      return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, '¿Qué día querés ingresar?', clearAvailabilityContext());
    case 'CREATE_BOOKING':
      return decision(ConversationSessionState.MAIN_MENU, 'La creación de reservas todavía no está disponible.', clearAvailabilityContext());
    case 'MY_BOOKING':
      return decision(ConversationSessionState.MAIN_MENU, 'La consulta de reservas todavía no está disponible.', clearAvailabilityContext());
    case 'HUMAN_HANDOFF':
      return { ...decision(ConversationSessionState.HUMAN_HANDOFF, 'Te estamos comunicando con una persona.', clearAvailabilityContext()), changeModeToHuman: true };
    default:
      return decision(ConversationSessionState.MAIN_MENU, 'Selecciona una opción del menú para continuar.', clearAvailabilityContext());
  }
}

function askCheckIn(input: Pick<ConversationBotInput, 'text' | 'businessToday'>, context: ConversationBotContext): ConversationBotDecision {
  const checkIn = parseConversationDate(input.text);
  if (!checkIn || checkIn < input.businessToday) return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, 'No pude interpretar esa fecha. Usá el formato DD/MM/AAAA.', context);
  return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT, '¿Qué día querés salir?', withAvailabilityContext({ checkIn }));
}

function askCheckOut(input: Pick<ConversationBotInput, 'text'>, context: ConversationBotContext): ConversationBotDecision {
  const checkIn = context.availability?.checkIn;
  const checkOut = parseConversationDate(input.text);
  if (!checkOut || !checkIn || checkOut <= checkIn) return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT, 'La fecha de salida debe ser posterior a la fecha de ingreso. Usá el formato DD/MM/AAAA.', context);
  return decision(ConversationSessionState.AVAILABILITY_ASK_GUESTS, '¿Cuántos huéspedes son?', withAvailabilityContext({ checkIn, checkOut }));
}

function askGuests(input: Pick<ConversationBotInput, 'text'>, context: ConversationBotContext, availabilityOptions?: readonly AvailabilityOption[]): ConversationBotDecision {
  const guestsText = input.text.trim();
  if (!/^\d+$/.test(guestsText) || Number(guestsText) <= 0) return decision(ConversationSessionState.AVAILABILITY_ASK_GUESTS, 'Indicá una cantidad entera positiva de huéspedes.', context);
  const guests = Number(guestsText);
  const availability = context.availability;
  if (!availability?.checkIn || !availability.checkOut) return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, '¿Qué día querés ingresar?', clearAvailabilityContext());
  const nextContext = withAvailabilityContext({ checkIn: availability.checkIn, checkOut: availability.checkOut, guests });
  if (availabilityOptions === undefined) return { ...decision(ConversationSessionState.AVAILABILITY_ASK_GUESTS, null, nextContext), availabilityRequest: { checkIn: availability.checkIn, checkOut: availability.checkOut, guests } };
  return availabilityResultsDecision(availabilityOptions, nextContext);
}

function fromAvailabilityResults(input: ConversationBotInput, context: ConversationBotContext): ConversationBotDecision {
  if (input.pricingQuote) return pricingQuoteDecision(input.pricingQuote, context);
  if (input.pricingUnavailable) return decision(ConversationSessionState.AVAILABILITY_RESULTS, 'No pude obtener una cotización para esa opción. Elegí otra opción o buscá otras fechas.', context);
  return selectAvailabilityOption(input, context);
}

function selectAvailabilityOption(input: ConversationBotInput, context: ConversationBotContext): ConversationBotDecision {
  const unavailable = unavailableSelectionDecision(input, context);
  if (unavailable) return unavailable;

  const normalized = input.text.trim();
  if (!/^\d+$/.test(normalized)) return invalidAvailabilityOption(context);
  const option = Number(normalized);
  if (option === 1 && context.availability?.options?.length === 0) return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, '¿Qué día querés ingresar?', clearAvailabilityContext());
  const selected = context.availability?.options?.find((candidate) => candidate.option === option);
  return selected ? selectionDecision(selected, context) : invalidAvailabilityOption(context);
}

function unavailableSelectionDecision(input: ConversationBotInput, context: ConversationBotContext): ConversationBotDecision | null {
  if (!input.availabilitySelectionUnavailable || input.availabilityOptions === undefined) return null;
  const nextContext = withAvailabilityOptions(context, input.availabilityOptions);
  const message = input.availabilityOptions.length === 0
    ? 'Esa opción ya no está disponible y no encontré otras alternativas para esas fechas.\n\n1. Buscar otras fechas\n0. Volver al menú'
    : `Esa opción ya no está disponible. Estas son las opciones actuales:\n\n${availabilityMessage(input.availabilityOptions)}`;
  return decision(ConversationSessionState.AVAILABILITY_RESULTS, message, nextContext);
}

function selectionDecision(selected: AvailabilityConversationOption, context: ConversationBotContext): ConversationBotDecision {
  const availability = context.availability;
  if (!availability?.checkIn || !availability.checkOut || !availability.guests) return invalidAvailabilityOption(context);
  return {
    ...decision(ConversationSessionState.AVAILABILITY_RESULTS, null, context),
    availabilitySelectionRequest: {
      resourceId: selected.resourceId,
      resourceName: selected.name,
      checkIn: availability.checkIn,
      checkOut: availability.checkOut,
      guests: availability.guests,
    },
  };
}

// eslint-disable-next-line complexity
function fromPricingQuote(input: ConversationBotInput, context: ConversationBotContext): ConversationBotDecision {
  const normalized = input.text.trim().toUpperCase();
  if (normalized === '1') {
    if (input.contact) return bookingConfirmationDecision(context, input.contact);
    return decision(ConversationSessionState.CONTACT_ASK_NAME, '¿A nombre de quién preparamos la reserva?', context);
  }
  if (normalized !== '0' && normalized !== 'VOLVER') return decision(ConversationSessionState.PRICING_QUOTE, 'Usá 1 para continuar o 0 para volver a las opciones.', context);

  const availability = context.availability;
  if (!availability?.checkIn || !availability.checkOut || !availability.guests) return decision(ConversationSessionState.MAIN_MENU, mainMenuMessage(), clearAvailabilityContext());
  const cleared = clearSelectionAndPricing(context);
  if (input.availabilityRefreshed && input.availabilityOptions !== undefined) return availabilityResultsDecision(input.availabilityOptions, cleared);
  return {
    ...decision(ConversationSessionState.AVAILABILITY_RESULTS, null, cleared),
    availabilityRefreshRequest: { checkIn: availability.checkIn, checkOut: availability.checkOut, guests: availability.guests },
  };
}

function fromContactName(input: ConversationBotInput, context: ConversationBotContext): ConversationBotDecision {
  const name = input.text.trim();
  if (name.length < 2 || name.length > 120) return decision(ConversationSessionState.CONTACT_ASK_NAME, 'Indicá un nombre válido para la reserva.', context);
  return bookingConfirmationDecision({ ...context, contact: { name } }, { contactId: '', name });
}

function bookingConfirmationDecision(context: ConversationBotContext, contact: ConversationContact): ConversationBotDecision {
  const selection = context.selection;
  const availability = context.availability;
  const pricing = context.pricing;
  if (!selection || !availability?.checkIn || !availability.checkOut || !availability.guests || !pricing) return decision(ConversationSessionState.MAIN_MENU, mainMenuMessage(), clearAvailabilityContext());
  const nextContext = readConversationBotContext({ ...context, contact: { ...(contact.contactId ? { contactId: contact.contactId } : {}), name: contact.name } });
  return decision(ConversationSessionState.BOOKING_CONFIRM, bookingReviewMessage(selection.resourceName, availability.checkIn, availability.checkOut, availability.guests, pricing.totalAmountMinor, pricing.currency, contact.name), nextContext);
}

// eslint-disable-next-line complexity
function fromBookingConfirmation(input: ConversationBotInput, context: ConversationBotContext): ConversationBotDecision {
  const normalized = input.text.trim().toUpperCase();
  if (normalized === '0' || normalized === 'VOLVER') return decision(ConversationSessionState.PRICING_QUOTE, pricingMessageFromContext(context), context);
  if (normalized !== '1') return decision(ConversationSessionState.BOOKING_CONFIRM, 'Usá 1 para confirmar o 0 para volver.', context);
  const request = bookingRequest(context);
  if (!request) return decision(ConversationSessionState.MAIN_MENU, mainMenuMessage(), clearAvailabilityContext());
  const result = input.bookingConfirmationResult;
  if (!result) return { ...decision(ConversationSessionState.BOOKING_CONFIRM, null, context), bookingConfirmationRequest: request };
  if (!result.availabilityAvailable) return decision(ConversationSessionState.AVAILABILITY_RESULTS, 'La opción elegida ya no está disponible. Elegí otra opción o buscá otras fechas.', clearSelectionAndPricing(context));
  if (result.pricingUnavailable || !result.pricingQuote) return decision(ConversationSessionState.PRICING_QUOTE, 'Ya no pude obtener esa cotización. Volvé a elegir una opción disponible.', clearSelectionAndPricing(context));
  const updated = result.pricingQuote;
  const previous = context.pricing;
  if (!previous || previous.currency !== updated.currency || previous.totalAmountMinor !== updated.totalAmountMinor || previous.ratePlanId !== updated.ratePlanId) {
    return decision(ConversationSessionState.BOOKING_CONFIRM, `El precio se actualizó.\n\n${bookingReviewMessage(updated.resourceName, updated.checkIn, updated.checkOut, updated.guests, updated.totalAmountMinor, updated.currency, context.contact?.name ?? '')}`, pricingQuoteContext(context, updated));
  }
  return { ...decision(ConversationSessionState.BOOKING_CONFIRM, null, context), bookingCreationRequest: request };
}

function bookingRequest(context: ConversationBotContext): BookingConfirmationRequest | null {
  const availability = context.availability;
  const selection = context.selection;
  const contact = context.contact;
  if (!availability?.checkIn || !availability.checkOut || !availability.guests || !selection || !contact?.name) return null;
  return { contactId: contact.contactId ?? null, contactName: contact.name, resourceId: selection.resourceId, checkIn: availability.checkIn, checkOut: availability.checkOut, guests: availability.guests };
}

function pricingQuoteContext(context: ConversationBotContext, quote: PricingQuoteOption): ConversationBotContext {
  return readConversationBotContext({ ...context, selection: { resourceId: quote.resourceId, resourceName: quote.resourceName }, pricing: { ratePlanId: quote.ratePlanId, ratePlanName: quote.ratePlanName, currency: quote.currency, nights: quote.nights, totalAmountMinor: quote.totalAmountMinor } });
}

function pricingMessageFromContext(context: ConversationBotContext): string {
  const selection = context.selection;
  const availability = context.availability;
  const pricing = context.pricing;
  if (!selection || !availability?.checkIn || !availability.checkOut || !availability.guests || !pricing) return 'La cotización ya no está disponible.';
  return pricingMessage({ resourceId: selection.resourceId, resourceName: selection.resourceName, checkIn: availability.checkIn, checkOut: availability.checkOut, guests: availability.guests, ratePlanId: pricing.ratePlanId, ratePlanName: pricing.ratePlanName, currency: pricing.currency, nights: pricing.nights, totalAmountMinor: pricing.totalAmountMinor });
}

function bookingReviewMessage(resourceName: string, checkIn: string, checkOut: string, guests: number, totalAmountMinor: number, currency: string, contactName: string): string {
  return `${resourceName}\n\n${checkIn} → ${checkOut}\n${guests} ${guests === 1 ? 'huésped' : 'huéspedes'}\n\nTotal: ${formatMoney(totalAmountMinor, currency)}\n\nNombre: ${contactName}\n\n1. Confirmar reserva\n0. Volver`;
}

function pricingQuoteDecision(quote: PricingQuoteOption, context: ConversationBotContext): ConversationBotDecision {
  const selection = { resourceId: quote.resourceId, resourceName: quote.resourceName };
  const pricing = { ratePlanId: quote.ratePlanId, ratePlanName: quote.ratePlanName, currency: quote.currency, nights: quote.nights, totalAmountMinor: quote.totalAmountMinor };
  const nextContext = readConversationBotContext({ ...context, selection, pricing });
  return decision(ConversationSessionState.PRICING_QUOTE, pricingMessage(quote), nextContext);
}

function availabilityResultsDecision(options: readonly AvailabilityOption[], context: ConversationBotContext): ConversationBotDecision {
  return decision(ConversationSessionState.AVAILABILITY_RESULTS, availabilityMessage(options), withAvailabilityOptions(context, options));
}

function invalidAvailabilityOption(context: ConversationBotContext): ConversationBotDecision {
  return decision(ConversationSessionState.AVAILABILITY_RESULTS, 'Esa opción no existe. Elegí uno de los números de la lista.', context);
}

function withAvailabilityOptions(context: ConversationBotContext, options: readonly AvailabilityOption[]): ConversationBotContext {
  const availability = context.availability;
  if (!availability) return context;
  return withAvailabilityContext({ ...availability, options: toConversationOptions(options) });
}

function toConversationOptions(options: readonly AvailabilityOption[]): AvailabilityConversationOption[] {
  return options.map((option, index) => ({ option: index + 1, resourceId: option.resourceId, name: option.name }));
}

function availabilityMessage(options: readonly AvailabilityOption[]): string {
  if (options.length === 0) return 'No encontré disponibilidad para esas fechas.\n\n1. Buscar otras fechas\n0. Volver al menú';
  return `Encontré estas opciones disponibles:\n\n${options.map((option, index) => `${index + 1}. ${option.name}`).join('\n')}\n\n0. Volver al menú`;
}

function pricingMessage(quote: PricingQuoteOption): string {
  const availability = `${quote.checkIn} → ${quote.checkOut}\n${quote.guests} ${quote.guests === 1 ? 'huésped' : 'huéspedes'}`;
  return `${quote.resourceName}\n\n${availability}\n\nTotal: ${formatMoney(quote.totalAmountMinor, quote.currency)}\n\n1. Continuar\n0. Volver`;
}

function formatMoney(amountMinor: number, currency: string): string {
  const amount = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(amountMinor);
  return `${amount} ${currency === 'PYG' ? 'Gs.' : currency}`;
}

function decision(state: ConversationSessionState, response: string | null, context: ConversationBotContext = {}): ConversationBotDecision {
  return { nextState: state, response, changeModeToHuman: false, context: readConversationBotContext(context) };
}

function isAvailabilityState(state: ConversationSessionState): boolean {
  return state === ConversationSessionState.AVAILABILITY_ASK_CHECK_IN || state === ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT || state === ConversationSessionState.AVAILABILITY_ASK_GUESTS || state === ConversationSessionState.AVAILABILITY_RESULTS;
}

function isCancel(text: string, state: ConversationSessionState): boolean {
  const normalized = text.trim().toUpperCase();
  return normalized === 'VOLVER' || normalized === 'CANCELAR' || (normalized === '0' && state === ConversationSessionState.AVAILABILITY_RESULTS);
}

function welcomeMessage(businessName: string): string {
  return `Hola / Bienvenido a ${businessName}\n${mainMenuMessage()}`;
}

function mainMenuMessage(): string {
  return '¿En qué podemos ayudarte?\n\n1. Consultar disponibilidad\n2. Crear una reserva\n3. Consultar mi reserva\n4. Hablar con una persona';
}
