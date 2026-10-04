import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationSessionState } from '../domain/conversation-session-state.enum';
import { decideConversationBotResponse, parseConversationBotIntent } from './conversation-bot.state-machine';

const common = { mode: ConversationMode.BOT, businessName: 'TOP', businessToday: '2026-10-03' } as const;

describe('conversation bot state machine', () => {
  it('greets once from START and enters MAIN_MENU', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.START, text: 'Hola' });

    expect(decision.nextState).toBe(ConversationSessionState.MAIN_MENU);
    expect(decision.response).toContain('TOP');
    expect(decision.changeModeToHuman).toBe(false);
  });

  it('moves MAIN_MENU option 1 to check-in prompt', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.MAIN_MENU, text: '1' });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN);
    expect(decision.response).toBe('¿Qué día querés ingresar?');
  });

  it.each([
    ['1', 'CONSULT_AVAILABILITY'],
    ['CREATE_BOOKING', 'CREATE_BOOKING'],
    ['3', 'MY_BOOKING'],
    ['4', 'HUMAN_HANDOFF'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseConversationBotIntent(input)).toBe(expected);
  });

  it.each(['15/10/2026', '2026-10-15'])('accepts date %s and stores normalized ISO context', (text) => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, text });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT);
    expect(decision.context).toEqual({ availability: { checkIn: '2026-10-15' } });
  });

  it.each(['31/02/2026', '01/10/2026'])('keeps ASK_CHECK_IN for invalid or past date %s', (text) => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, text });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN);
    expect(decision.context).toEqual({});
  });

  it('keeps ASK_CHECK_OUT when checkout is not after check-in', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT, text: '14/10/2026', context: { availability: { checkIn: '2026-10-15' } } });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT);
    expect(decision.context).toEqual({ availability: { checkIn: '2026-10-15' } });
  });

  it('moves to guests after valid checkout', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_CHECK_OUT, text: '17/10/2026', context: { availability: { checkIn: '2026-10-15' } } });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_GUESTS);
    expect(decision.context).toEqual({ availability: { checkIn: '2026-10-15', checkOut: '2026-10-17' } });
  });

  it.each(['0', '-1', '2.5', 'abc'])('keeps ASK_GUESTS for invalid guest count %s', (text) => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_GUESTS, text, context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17' } } });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_GUESTS);
    expect(decision.context).toEqual({ availability: { checkIn: '2026-10-15', checkOut: '2026-10-17' } });
  });

  it('requests Availability exactly after valid guests and renders results', () => {
    const request = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_GUESTS, text: '2', context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17' } } });
    const result = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_GUESTS, text: '2', context: request.context, availabilityOptions: [{ resourceId: 'resource-1', name: 'Cabaña Familiar' }] });

    expect(request.availabilityRequest).toEqual({ checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2 });
    expect(result.nextState).toBe(ConversationSessionState.AVAILABILITY_RESULTS);
    expect(result.response).toContain('Cabaña Familiar');
    expect(result.response).not.toContain('resource-1');
    expect(result.context).toEqual({ availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, options: [{ option: 1, resourceId: 'resource-1', name: 'Cabaña Familiar' }] } });
  });

  it('asigna opciones deterministas y conserva sus identidades internas', () => {
    const result = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_GUESTS, text: '2', context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17' } }, availabilityOptions: [{ resourceId: 'resource-a', name: 'Cabaña A' }, { resourceId: 'resource-b', name: 'Cabaña B' }] });

    expect(result.context).toMatchObject({ availability: { options: [{ option: 1, resourceId: 'resource-a', name: 'Cabaña A' }, { option: 2, resourceId: 'resource-b', name: 'Cabaña B' }] } });
    expect(result.response).toBe('Encontré estas opciones disponibles:\n\n1. Cabaña A\n2. Cabaña B\n\n0. Volver al menú');
  });

  it('renders the empty availability response and clears context on cancel', () => {
    const result = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_ASK_GUESTS, text: '2', context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17' } }, availabilityOptions: [] });
    const cancelled = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_RESULTS, text: '0', context: result.context });

    expect(result.response).toContain('No encontré disponibilidad');
    expect(cancelled.nextState).toBe(ConversationSessionState.MAIN_MENU);
    expect(cancelled.context).toEqual({});
  });

  it('supports searching other dates and human handoff without running bot logic', () => {
    const searchAgain = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_RESULTS, text: '1', context: { availability: { checkIn: '2026-10-15' } } });
    const human = decideConversationBotResponse({ ...common, mode: ConversationMode.HUMAN, state: ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, text: '15/10/2026' });

    expect(searchAgain.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN);
    expect(searchAgain.context).toEqual({});
    expect(human.response).toBeNull();
  });

  it('transfers to HUMAN on option 4', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.MAIN_MENU, text: '4' });

    expect(decision.nextState).toBe(ConversationSessionState.HUMAN_HANDOFF);
    expect(decision.response).toBe('Te estamos comunicando con una persona.');
    expect(decision.changeModeToHuman).toBe(true);
  });
});
