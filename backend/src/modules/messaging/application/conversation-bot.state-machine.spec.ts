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
    const searchAgain = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_RESULTS, text: '1', context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, options: [] } } });
    const human = decideConversationBotResponse({ ...common, mode: ConversationMode.HUMAN, state: ConversationSessionState.AVAILABILITY_ASK_CHECK_IN, text: '15/10/2026' });

    expect(searchAgain.nextState).toBe(ConversationSessionState.AVAILABILITY_ASK_CHECK_IN);
    expect(searchAgain.context).toEqual({});
    expect(human.response).toBeNull();
  });

  it('resuelve una selección por option y no por nombre', () => {
    const decision = decideConversationBotResponse({
      ...common,
      state: ConversationSessionState.AVAILABILITY_RESULTS,
      text: '2',
      context: {
        availability: {
          checkIn: '2026-10-15',
          checkOut: '2026-10-17',
          guests: 2,
          options: [
            { option: 1, resourceId: 'resource-a', name: 'Cabaña A' },
            { option: 2, resourceId: 'resource-b', name: 'Cabaña B' },
          ],
        },
      },
    });

    expect(decision.availabilitySelectionRequest).toEqual({ resourceId: 'resource-b', resourceName: 'Cabaña B', checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2 });
    expect(decision.response).toBeNull();
  });

  it('mantiene resultados y no solicita Pricing para una opción inexistente', () => {
    const decision = decideConversationBotResponse({
      ...common,
      state: ConversationSessionState.AVAILABILITY_RESULTS,
      text: '3',
      context: {
        availability: {
          checkIn: '2026-10-15',
          checkOut: '2026-10-17',
          guests: 2,
          options: [{ option: 1, resourceId: 'resource-a', name: 'Cabaña A' }],
        },
      },
    });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_RESULTS);
    expect(decision.availabilitySelectionRequest).toBeUndefined();
    expect(decision.response).toContain('Esa opción no existe');
  });

  it('presenta una cotización sin exponer IDs y persiste selección y pricing', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.AVAILABILITY_RESULTS, text: '1', context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, options: [{ option: 1, resourceId: 'resource-a', name: 'Cabaña A' }] }, }, pricingQuote: { resourceId: 'resource-a', resourceName: 'Cabaña A', checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, ratePlanId: 'plan-a', ratePlanName: 'Plan base', currency: 'PYG', nights: 2, totalAmountMinor: 1250000 } });

    expect(decision.nextState).toBe(ConversationSessionState.PRICING_QUOTE);
    expect(decision.response).toContain('Cabaña A');
    expect(decision.response).toContain('1.250.000 Gs.');
    expect(decision.response).not.toContain('resource-a');
    expect(decision.response).not.toContain('plan-a');
    expect(decision.context).toMatchObject({ selection: { resourceId: 'resource-a', resourceName: 'Cabaña A' }, pricing: { ratePlanId: 'plan-a', currency: 'PYG', totalAmountMinor: 1250000 } });
  });

  it('desde la cotización vuelve a resultados solicitando Availability fresca', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.PRICING_QUOTE, text: '0', context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, options: [{ option: 1, resourceId: 'resource-a', name: 'Cabaña A' }] }, selection: { resourceId: 'resource-a', resourceName: 'Cabaña A' }, pricing: { ratePlanId: 'plan-a', ratePlanName: 'Plan base', currency: 'PYG', nights: 2, totalAmountMinor: 1250000 } } });

    expect(decision.nextState).toBe(ConversationSessionState.AVAILABILITY_RESULTS);
    expect(decision.availabilityRefreshRequest).toEqual({ checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2 });
    expect(decision.context).not.toHaveProperty('selection');
    expect(decision.context).not.toHaveProperty('pricing');
  });

  it('CANCELAR desde la cotización limpia todo el flujo', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.PRICING_QUOTE, text: 'CANCELAR', context: { availability: { checkIn: '2026-10-15' }, selection: { resourceId: 'resource-a', resourceName: 'Cabaña A' } } });

    expect(decision.nextState).toBe(ConversationSessionState.MAIN_MENU);
    expect(decision.context).toEqual({});
  });

  it('pide el nombre y exige confirmación explícita antes de crear Booking', () => {
    const quote = { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2 }, selection: { resourceId: 'resource-a', resourceName: 'Cabaña A' }, pricing: { ratePlanId: 'plan-a', ratePlanName: 'Plan base', currency: 'PYG', nights: 2, totalAmountMinor: 900000 } };
    const askName = decideConversationBotResponse({ ...common, state: ConversationSessionState.PRICING_QUOTE, text: '1', context: quote });
    expect(askName.nextState).toBe(ConversationSessionState.CONTACT_ASK_NAME);
    expect(askName.response).toContain('nombre');
    const review = decideConversationBotResponse({ ...common, state: ConversationSessionState.CONTACT_ASK_NAME, text: 'Juan Perez', context: quote });
    expect(review.nextState).toBe(ConversationSessionState.BOOKING_CONFIRM);
    expect(review.response).toContain('1. Confirmar reserva');
    const request = decideConversationBotResponse({ ...common, state: ConversationSessionState.BOOKING_CONFIRM, text: '1', context: review.context });
    expect(request.bookingConfirmationRequest).toEqual(expect.objectContaining({ contactName: 'Juan Perez', resourceId: 'resource-a' }));
    expect(request.bookingCreationRequest).toBeUndefined();
  });

  it('pide una nueva confirmación si el precio cambia al revalidar', () => {
    const context = { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2 }, selection: { resourceId: 'resource-a', resourceName: 'Cabaña A' }, pricing: { ratePlanId: 'plan-a', ratePlanName: 'Plan base', currency: 'PYG', nights: 2, totalAmountMinor: 900000 }, contact: { name: 'Juan Perez' } };
    const result = decideConversationBotResponse({ ...common, state: ConversationSessionState.BOOKING_CONFIRM, text: '1', context, bookingConfirmationResult: { availabilityAvailable: true, pricingQuote: { resourceId: 'resource-a', resourceName: 'Cabaña A', checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, ratePlanId: 'plan-a', ratePlanName: 'Plan base', currency: 'PYG', nights: 2, totalAmountMinor: 950000 } } });
    expect(result.nextState).toBe(ConversationSessionState.BOOKING_CONFIRM);
    expect(result.response).toContain('950.000 Gs.');
    expect(result.bookingCreationRequest).toBeUndefined();
  });

  it('transfers to HUMAN on option 4', () => {
    const decision = decideConversationBotResponse({ ...common, state: ConversationSessionState.MAIN_MENU, text: '4' });

    expect(decision.nextState).toBe(ConversationSessionState.HUMAN_HANDOFF);
    expect(decision.response).toBe('Te estamos comunicando con una persona.');
    expect(decision.changeModeToHuman).toBe(true);
  });
});
