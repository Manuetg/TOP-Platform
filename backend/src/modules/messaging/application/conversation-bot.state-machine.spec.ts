import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationSessionState } from '../domain/conversation-session-state.enum';
import { decideConversationBotResponse, parseConversationBotIntent } from './conversation-bot.state-machine';

describe('conversation bot state machine', () => {
  it('greets once from START and enters MAIN_MENU', () => {
    const decision = decideConversationBotResponse({ state: ConversationSessionState.START, mode: ConversationMode.BOT, text: 'Hola', businessName: 'Cabañas TOP' });

    expect(decision.nextState).toBe(ConversationSessionState.MAIN_MENU);
    expect(decision.response).toContain('Cabañas TOP');
    expect(decision.changeModeToHuman).toBe(false);
  });

  it.each([
    ['1', 'CONSULT_AVAILABILITY'],
    ['CREATE_BOOKING', 'CREATE_BOOKING'],
    ['3', 'MY_BOOKING'],
    ['4', 'HUMAN_HANDOFF'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseConversationBotIntent(input)).toBe(expected);
  });

  it('keeps MAIN_MENU for unsupported capabilities', () => {
    const decision = decideConversationBotResponse({ state: ConversationSessionState.MAIN_MENU, mode: ConversationMode.BOT, text: '1', businessName: 'TOP' });

    expect(decision.nextState).toBe(ConversationSessionState.MAIN_MENU);
    expect(decision.response).toContain('disponibilidad');
    expect(decision.changeModeToHuman).toBe(false);
  });

  it('transfers to HUMAN on option 4', () => {
    const decision = decideConversationBotResponse({ state: ConversationSessionState.MAIN_MENU, mode: ConversationMode.BOT, text: '4', businessName: 'TOP' });

    expect(decision).toEqual({ nextState: ConversationSessionState.HUMAN_HANDOFF, response: 'Te estamos comunicando con una persona.', changeModeToHuman: true });
  });

  it('resumes in MAIN_MENU when HUMAN returns to BOT', () => {
    const decision = decideConversationBotResponse({ state: ConversationSessionState.HUMAN_HANDOFF, mode: ConversationMode.BOT, text: '2', businessName: 'TOP' });

    expect(decision.nextState).toBe(ConversationSessionState.MAIN_MENU);
    expect(decision.response).toContain('creación de reservas');
  });
});
