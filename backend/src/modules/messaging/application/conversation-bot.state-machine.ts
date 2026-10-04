import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationSessionState } from '../domain/conversation-session-state.enum';
import { clearAvailabilityContext, type AvailabilityConversationOption, type ConversationBotContext, readConversationBotContext, withAvailabilityContext } from './conversation-bot-context';
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

export interface ConversationBotDecision {
  nextState: ConversationSessionState;
  response: string | null;
  changeModeToHuman: boolean;
  context: ConversationBotContext;
  availabilityRequest?: AvailabilityQueryRequest;
}

export function decideConversationBotResponse(input: {
  state: ConversationSessionState;
  mode: ConversationMode;
  text: string;
  businessName: string;
  businessToday: string;
  context?: ConversationBotContext;
  availabilityOptions?: readonly AvailabilityOption[];
}): ConversationBotDecision {
  if (input.mode === ConversationMode.HUMAN) return decision(input.state, null, input.context);

  const context = readConversationBotContext(input.context);
  const state = input.state === ConversationSessionState.HUMAN_HANDOFF
    ? ConversationSessionState.MAIN_MENU
    : input.state;

  if (isAvailabilityState(state) && isCancel(input.text, state)) {
    return decision(ConversationSessionState.MAIN_MENU, mainMenuMessage(), clearAvailabilityContext());
  }

  return decideForState(state, input, context);
}

function decideForState(state: ConversationSessionState, input: { text: string; businessName: string; businessToday: string; availabilityOptions?: readonly AvailabilityOption[] }, context: ConversationBotContext): ConversationBotDecision {
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
      return fromAvailabilityResults(input.text, context);
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

function askCheckIn(input: { text: string; businessToday: string }, context: ConversationBotContext): ConversationBotDecision {
  const checkIn = parseConversationDate(input.text);
  if (!checkIn || checkIn < input.businessToday) return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, 'No pude interpretar esa fecha. Usá el formato DD/MM/AAAA.', context);
  return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT, '¿Qué día querés salir?', withAvailabilityContext({ checkIn }));
}

function askCheckOut(input: { text: string }, context: ConversationBotContext): ConversationBotDecision {
  const checkIn = context.availability?.checkIn;
  const checkOut = parseConversationDate(input.text);
  if (!checkOut || !checkIn || checkOut <= checkIn) return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT, 'La fecha de salida debe ser posterior a la fecha de ingreso. Usá el formato DD/MM/AAAA.', context);
  return decision(ConversationSessionState.AVAILABILITY_ASK_GUESTS, '¿Cuántos huéspedes son?', withAvailabilityContext({ checkIn, checkOut }));
}

function askGuests(input: { text: string }, context: ConversationBotContext, availabilityOptions?: readonly AvailabilityOption[]): ConversationBotDecision {
  const guestsText = input.text.trim();
  if (!/^\d+$/.test(guestsText) || Number(guestsText) <= 0) return decision(ConversationSessionState.AVAILABILITY_ASK_GUESTS, 'Indicá una cantidad entera positiva de huéspedes.', context);
  const guests = Number(guestsText);
  const availability = context.availability;
  if (!availability?.checkIn || !availability.checkOut) return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, '¿Qué día querés ingresar?', clearAvailabilityContext());
  const nextContext = withAvailabilityContext({ checkIn: availability.checkIn, checkOut: availability.checkOut, guests });
  if (availabilityOptions === undefined) return { ...decision(ConversationSessionState.AVAILABILITY_ASK_GUESTS, null, nextContext), availabilityRequest: { checkIn: availability.checkIn, checkOut: availability.checkOut, guests } };
  const options = availabilityOptions.map<AvailabilityConversationOption>((option, index) => ({ option: index + 1, resourceId: option.resourceId, name: option.name }));
  return decision(ConversationSessionState.AVAILABILITY_RESULTS, availabilityMessage(options), withAvailabilityContext({ ...nextContext.availability, options }));
}

function fromAvailabilityResults(text: string, context: ConversationBotContext): ConversationBotDecision {
  const normalized = text.trim().toUpperCase();
  if (normalized === '1') return decision(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, '¿Qué día querés ingresar?', clearAvailabilityContext());
  return decision(ConversationSessionState.AVAILABILITY_RESULTS, 'Usá 1 para buscar otras fechas o 0 para volver al menú.', context);
}

function availabilityMessage(options: readonly AvailabilityConversationOption[]): string {
  if (options.length === 0) return 'No encontré disponibilidad para esas fechas.\n\n1. Buscar otras fechas\n0. Volver al menú';
  return `Encontré estas opciones disponibles:\n\n${options.map((option) => `${option.option}. ${option.name}`).join('\n')}\n\n0. Volver al menú`;
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
