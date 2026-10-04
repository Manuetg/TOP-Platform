import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationSessionState } from '../domain/conversation-session-state.enum';

export type ConversationBotIntent =
  | 'CONSULT_AVAILABILITY'
  | 'CREATE_BOOKING'
  | 'MY_BOOKING'
  | 'HUMAN_HANDOFF'
  | 'UNKNOWN';

export interface ConversationBotDecision {
  nextState: ConversationSessionState;
  response: string | null;
  changeModeToHuman: boolean;
}

export function decideConversationBotResponse(input: {
  state: ConversationSessionState;
  mode: ConversationMode;
  text: string;
  businessName: string;
}): ConversationBotDecision {
  if (input.mode === ConversationMode.HUMAN) {
    return { nextState: input.state, response: null, changeModeToHuman: false };
  }

  const state = input.state === ConversationSessionState.HUMAN_HANDOFF
    ? ConversationSessionState.MAIN_MENU
    : input.state;

  if (state === ConversationSessionState.START) {
    return {
      nextState: ConversationSessionState.MAIN_MENU,
      response: welcomeMessage(input.businessName),
      changeModeToHuman: false,
    };
  }

  switch (parseConversationBotIntent(input.text)) {
    case 'CONSULT_AVAILABILITY':
      return unsupported(state, 'La consulta de disponibilidad todavía no está disponible.');
    case 'CREATE_BOOKING':
      return unsupported(state, 'La creación de reservas todavía no está disponible.');
    case 'MY_BOOKING':
      return unsupported(state, 'La consulta de reservas todavía no está disponible.');
    case 'HUMAN_HANDOFF':
      return {
        nextState: ConversationSessionState.HUMAN_HANDOFF,
        response: 'Te estamos comunicando con una persona.',
        changeModeToHuman: true,
      };
    default:
      return unsupported(state, 'Selecciona una opción del menú para continuar.');
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

function welcomeMessage(businessName: string): string {
  return `Hola / Bienvenido a ${businessName}\n¿En qué podemos ayudarte?\n\n1. Consultar disponibilidad\n2. Crear una reserva\n3. Consultar mi reserva\n4. Hablar con una persona`;
}

function unsupported(state: ConversationSessionState, response: string): ConversationBotDecision {
  return { nextState: state, response, changeModeToHuman: false };
}
