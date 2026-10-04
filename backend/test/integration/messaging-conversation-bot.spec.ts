import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaBlockRepository } from '../../src/modules/block/infrastructure/prisma-block.repository';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { ListAvailableResourcesUseCase } from '../../src/modules/availability/application/list-available-resources.use-case';
import { ListAvailabilityCalendarUseCase } from '../../src/modules/availability/application/list-availability-calendar.use-case';
import { PrismaAvailabilityRulesRepository } from '../../src/modules/availability/infrastructure/prisma-availability-rules.repository';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import type { AvailabilityQuery } from '../../src/modules/availability/availability.contract';
import type { PricingQuote } from '../../src/modules/pricing/pricing.contract';
import { PricingQuoteUseCase } from '../../src/modules/pricing/application/pricing-quote.use-case';
import { CalculatePriceUseCase } from '../../src/modules/pricing/application/calculate-price.use-case';
import { ListRatePlansUseCase } from '../../src/modules/pricing/application/list-rate-plans.use-case';
import { PricingCalculator } from '../../src/modules/pricing/domain/pricing-calculator';
import { PrismaRatePlanRepository } from '../../src/modules/pricing/infrastructure/prisma-rate-plan.repository';
import { PrismaSeasonalRateRepository } from '../../src/modules/pricing/infrastructure/prisma-seasonal-rate.repository';
import { ChangeConversationModeUseCase } from '../../src/modules/messaging/application/change-conversation-mode.use-case';
import { ConversationBotConsumer } from '../../src/modules/messaging/application/conversation-bot.consumer';
import { PrismaConversationBotTransaction } from '../../src/modules/messaging/infrastructure/prisma-conversation-bot.transaction';
import { ReceiveInboundMessageUseCase } from '../../src/modules/messaging/application/receive-inbound-message.use-case';
import { SendOutboundMessageUseCase } from '../../src/modules/messaging/application/send-outbound-message.use-case';
import { ConversationMode } from '../../src/modules/messaging/domain/conversation-mode.enum';
import { PrismaConversationRepository } from '../../src/modules/messaging/infrastructure/prisma-conversation.repository';
import { PrismaOutboundMessageRepository } from '../../src/modules/messaging/infrastructure/prisma-outbound-message.repository';
import { PrismaReceiveInboundMessageTransaction } from '../../src/modules/messaging/infrastructure/prisma-receive-inbound-message.transaction';
import { IntegrationEventConsumerRegistry } from '../../src/shared/integration-events/integration-event-consumer-registry';
import { IntegrationEventDispatcher } from '../../src/shared/integration-events/integration-event-dispatcher';
import type { IntegrationEvent } from '../../src/shared/integration-events/integration-event';
import { PrismaIntegrationEventOutbox } from '../../src/shared/infrastructure/prisma-integration-event.outbox';
import { PrismaIntegrationOutboxRepository } from '../../src/shared/infrastructure/prisma-integration-outbox.repository';
import { cleanTestDatabase } from './support/clean-test-database';
import { FakeMessagingProvider } from './support/fake-messaging.provider';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Messaging conversation bot', () => {
  const prisma = new PrismaClient();
  const outbox = new PrismaIntegrationOutboxRepository(prisma);
  const integrationEventOutbox = new PrismaIntegrationEventOutbox();
  const contacts = { findByMessagingAddressAndBusinessId: jest.fn().mockResolvedValue(null) };
  const conversations = new PrismaConversationRepository(prisma);
  const businesses = new PrismaBusinessRepository(prisma);
  const resources = new PrismaResourceRepository(prisma);
  const ratePlans = new PrismaRatePlanRepository(prisma);
  const seasonalRates = new PrismaSeasonalRateRepository(prisma);
  const availability = new ListAvailableResourcesUseCase(
    new ListAvailabilityCalendarUseCase(businesses, resources, new PrismaBookingRepository(prisma), new PrismaBlockRepository(prisma), new PrismaAvailabilityRulesRepository(prisma)),
    resources,
  );
  const pricing = new PricingQuoteUseCase(
    new ListRatePlansUseCase(businesses, resources, ratePlans),
    new CalculatePriceUseCase(businesses, resources, ratePlans, ratePlans, seasonalRates, new PricingCalculator()),
  );

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function business(name = 'Bot Business') {
    return prisma.business.create({ data: { name: `${name} ${randomUUID()}` } });
  }

  function input(businessId: string, providerMessageId: string, text = 'Hola', sender = '+595981234567') {
    return { businessId, channel: 'WHATSAPP' as const, providerMessageId, sender, messageType: 'TEXT' as const, payload: { text }, receivedAt: new Date('2026-10-03T12:00:00.000Z') };
  }

  function bot() {
    return botWithAvailability(availability, pricing);
  }

  function botWithAvailability(query: AvailabilityQuery, quote: PricingQuote = pricing) {
    const registry = new IntegrationEventConsumerRegistry();
    const transaction = new PrismaConversationBotTransaction(prisma, new PrismaOutboundMessageRepository(prisma), query, quote);
    const consumer = new ConversationBotConsumer(businesses, transaction, registry);
    const dispatcher = new IntegrationEventDispatcher(outbox, [consumer], { baseBackoffMs: 0 });
    return { consumer, dispatcher };
  }

  async function receive(businessId: string, providerMessageId: string, text = 'Hola', sender = '+595981234567') {
    const receiver = new ReceiveInboundMessageUseCase(contacts, new PrismaReceiveInboundMessageTransaction(prisma, integrationEventOutbox));
    const result = await receiver.execute(input(businessId, providerMessageId, text, sender));
    const event = (await prisma.integrationOutboxEvent.findMany({ where: { businessId, eventType: 'MESSAGING_INBOUND_RECEIVED', aggregateId: result.conversation.id }, orderBy: [{ createdAt: 'asc' }, { eventId: 'asc' }] })).find((candidate) => (candidate.payload as { inboundMessageId?: string }).inboundMessageId === result.message.id);
    if (!event) throw new Error('No se encontró el evento de integración del mensaje entrante.');
    return { result, event };
  }

  async function eventAsContract(eventId: string): Promise<IntegrationEvent> {
    const event = await prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId } });
    return { eventId: event.eventId, eventType: event.eventType, payloadVersion: event.payloadVersion, businessId: event.businessId, aggregateType: event.aggregateType, aggregateId: event.aggregateId, occurredAt: event.occurredAt, correlationId: event.correlationId, payload: event.payload as IntegrationEvent['payload'] };
  }

  it('crea sesión START, responde bienvenida y deja OutboundMessage PENDING', async () => {
    const owner = await business('Cabañas TOP');
    const { result } = await receive(owner.id, 'wamid-bot-1');
    const { dispatcher } = bot();

    await expect(dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    await expect(prisma.conversationSession.findUniqueOrThrow({ where: { conversationId_businessId: { conversationId: result.conversation.id, businessId: owner.id } } })).resolves.toMatchObject({ businessId: owner.id, state: 'MAIN_MENU' });
    await expect(prisma.outboundMessage.findMany({ where: { businessId: owner.id } })).resolves.toEqual([expect.objectContaining({ status: 'PENDING', messageType: 'CONVERSATION_REPLY', payload: expect.objectContaining({ text: expect.stringContaining(owner.name) }) })]);
  });

  it('no repite la bienvenida en el segundo mensaje y conserva la sesión', async () => {
    const owner = await business();
    const first = await receive(owner.id, 'wamid-bot-2a');
    const worker = bot().dispatcher;
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');
    await receive(owner.id, 'wamid-bot-2b', 'Hola otra vez');
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');

    const messages = await prisma.outboundMessage.findMany({ where: { businessId: owner.id }, orderBy: { createdAt: 'asc' } });
    expect(messages).toHaveLength(2);
    expect((messages[0].payload as { text: string }).text).toContain('Bienvenido');
    expect((messages[1].payload as { text: string }).text).not.toContain('Bienvenido');
    await expect(prisma.conversationSession.findUniqueOrThrow({ where: { conversationId_businessId: { conversationId: first.result.conversation.id, businessId: owner.id } } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  it.each([
    ['2', 'creación de reservas'],
    ['3', 'consulta de reservas'],
  ])('responde de forma controlada a la opción %s', async (option, response) => {
    const owner = await business();
    const worker = bot().dispatcher;
    await receive(owner.id, `wamid-option-${option}-a`);
    await worker.dispatchOnce();
    await receive(owner.id, `wamid-option-${option}-b`, option);
    await worker.dispatchOnce();

    const messages = await prisma.outboundMessage.findMany({ where: { businessId: owner.id }, orderBy: { createdAt: 'asc' } });
    expect((messages[1].payload as { text: string }).text).toContain(response);
    await expect(prisma.conversation.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ mode: 'BOT' });
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  async function sendAndDispatch(ownerId: string, worker: IntegrationEventDispatcher, providerMessageId: string, text: string): Promise<void> {
    await receive(ownerId, providerMessageId, text);
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');
  }

  function countedAvailability(): { query: AvailabilityQuery; calls: () => number } {
    let count = 0;
    return {
      query: {
        findAvailableResources: async (input) => {
          count += 1;
          return availability.findAvailableResources(input);
        },
      },
      calls: () => count,
    };
  }

  async function resource(ownerId: string, name: string, capacityMaximum: number): Promise<{ id: string; name: string }> {
    return prisma.resource.create({ data: { businessId: ownerId, name, internalCode: `${name}-${randomUUID()}`, capacityMaximum, capacityMaximumChildren: 0 }, select: { id: true, name: true } });
  }

  async function ratePlan(ownerId: string, resourceId: string, name = 'Plan base', amountMinor = 450000): Promise<{ id: string; name: string }> {
    return prisma.ratePlan.create({ data: { businessId: ownerId, name, baseNightlyAmountMinor: amountMinor, resources: { create: { resourceId } } }, select: { id: true, name: true } });
  }

  async function beginAvailability(ownerId: string, worker: IntegrationEventDispatcher, prefix: string): Promise<void> {
    await sendAndDispatch(ownerId, worker, `${prefix}-hello`, 'Hola');
    await sendAndDispatch(ownerId, worker, `${prefix}-menu`, '1');
    await sendAndDispatch(ownerId, worker, `${prefix}-check-in`, '15/10/2026');
    await sendAndDispatch(ownerId, worker, `${prefix}-check-out`, '17/10/2026');
  }

  it('recopila fechas y huéspedes, consulta Availability una sola vez y muestra sólo Resources aptos', async () => {
    const owner = await business('Availability');
    const available = await resource(owner.id, 'Cabaña disponible', 2);
    const secondAvailable = await resource(owner.id, 'Cabaña alternativa', 4);
    await resource(owner.id, 'Cabaña pequeña', 1);
    const blocked = await resource(owner.id, 'Cabaña bloqueada', 2);
    await prisma.block.create({ data: { businessId: owner.id, resourceId: blocked.id, type: 'MAINTENANCE', reason: 'Mantenimiento', startsAt: new Date('2026-10-15T00:00:00.000Z'), endsAt: new Date('2026-10-17T00:00:00.000Z') } });
    const counted = countedAvailability();
    const worker = botWithAvailability(counted.query).dispatcher;

    await expect(availability.findAvailableResources({ businessId: owner.id, from: '2026-10-15', to: '2026-10-17', guests: 2 })).resolves.toEqual([{ resourceId: secondAvailable.id, name: secondAvailable.name }, { resourceId: available.id, name: available.name }]);

    await beginAvailability(owner.id, worker, 'wamid-availability');
    await sendAndDispatch(owner.id, worker, 'wamid-availability-guests', '2');

    expect(counted.calls()).toBe(1);
    const messages = await prisma.outboundMessage.findMany({ where: { businessId: owner.id }, orderBy: { createdAt: 'asc' } });
    expect((messages.at(-1)?.payload as { text: string }).text).toContain('Cabaña disponible');
    expect((messages.at(-1)?.payload as { text: string }).text).toContain('Cabaña alternativa');
    expect((messages.at(-1)?.payload as { text: string }).text).not.toContain(available.id);
    expect((messages.at(-1)?.payload as { text: string }).text).not.toContain(secondAvailable.id);
    expect((messages.at(-1)?.payload as { text: string }).text).not.toContain('Cabaña pequeña');
    expect((messages.at(-1)?.payload as { text: string }).text).not.toContain('Cabaña bloqueada');
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'AVAILABILITY_RESULTS', context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, options: [{ option: 1, resourceId: secondAvailable.id, name: secondAvailable.name }, { option: 2, resourceId: available.id, name: available.name }] } } });
  });

  it('sin disponibilidad permite buscar otras fechas limpiando context', async () => {
    const owner = await business('No Availability');
    const worker = bot().dispatcher;
    await beginAvailability(owner.id, worker, 'wamid-empty');
    await sendAndDispatch(owner.id, worker, 'wamid-empty-guests', '2');
    await sendAndDispatch(owner.id, worker, 'wamid-empty-again', '1');

    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'AVAILABILITY_ASK_CHECK_IN', context: {} });
  });

  it('0 desde resultados vuelve al menú y limpia context', async () => {
    const owner = await business('Cancel Results');
    const worker = bot().dispatcher;
    await beginAvailability(owner.id, worker, 'wamid-results-cancel');
    await sendAndDispatch(owner.id, worker, 'wamid-results-cancel-guests', '2');
    await sendAndDispatch(owner.id, worker, 'wamid-results-cancel-zero', '0');

    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'MAIN_MENU', context: {} });
  });

  it('selecciona Resource, revalida Availability y persiste una cotización real', async () => {
    const owner = await business('Pricing Quote');
    const selected = await resource(owner.id, 'Cabaña Premium', 4);
    const plan = await ratePlan(owner.id, selected.id, 'Plan estándar', 625000);
    const worker = bot().dispatcher;

    await beginAvailability(owner.id, worker, 'wamid-quote');
    await sendAndDispatch(owner.id, worker, 'wamid-quote-guests', '4');
    const selectedEvent = await receive(owner.id, 'wamid-quote-selection', '1');
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');

    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: owner.id }, orderBy: { createdAt: 'desc' } });
    const text = (message.payload as { text: string }).text;
    expect(text).toContain('Cabaña Premium');
    expect(text).toContain('1.250.000 Gs.');
    expect(text).not.toContain(selected.id);
    expect(text).not.toContain(plan.id);
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'PRICING_QUOTE', context: { selection: { resourceId: selected.id, resourceName: selected.name }, pricing: { ratePlanId: plan.id, currency: 'PYG', nights: 2, totalAmountMinor: 1250000 } } });

    const before = await prisma.outboundMessage.count({ where: { businessId: owner.id } });
    const consumer = bot().consumer;
    await consumer.handle(await eventAsContract(selectedEvent.event.eventId));
    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(before);
  });

  it('no llama Pricing para una opción inexistente', async () => {
    const owner = await business('Invalid Pricing Option');
    await resource(owner.id, 'Cabaña única', 2);
    const quote = { quote: jest.fn() } as never;
    const worker = botWithAvailability(availability, quote).dispatcher;

    await beginAvailability(owner.id, worker, 'wamid-invalid-option');
    await sendAndDispatch(owner.id, worker, 'wamid-invalid-option-guests', '2');
    await sendAndDispatch(owner.id, worker, 'wamid-invalid-option-selection', '2');

    expect((quote as { quote: jest.Mock }).quote).not.toHaveBeenCalled();
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'AVAILABILITY_RESULTS' });
  });

  it('actualiza las opciones si el Resource seleccionado quedó ocupado', async () => {
    const owner = await business('Stale Selection');
    const selected = await resource(owner.id, 'Cabaña A', 2);
    await resource(owner.id, 'Cabaña B', 2);
    const quote = { quote: jest.fn() } as never;
    const worker = botWithAvailability(availability, quote).dispatcher;

    await beginAvailability(owner.id, worker, 'wamid-stale-selection');
    await sendAndDispatch(owner.id, worker, 'wamid-stale-selection-guests', '2');
    await prisma.block.create({ data: { businessId: owner.id, resourceId: selected.id, type: 'MAINTENANCE', reason: 'Mantenimiento', startsAt: new Date('2026-10-15T00:00:00.000Z'), endsAt: new Date('2026-10-17T00:00:00.000Z') } });
    await sendAndDispatch(owner.id, worker, 'wamid-stale-selection-choice', '1');

    expect((quote as { quote: jest.Mock }).quote).not.toHaveBeenCalled();
    const session = await prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } });
    expect(session.state).toBe('AVAILABILITY_RESULTS');
    expect(session.context).toMatchObject({ availability: { options: [{ option: 1, name: 'Cabaña B' }] } });
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: owner.id }, orderBy: { createdAt: 'desc' } });
    expect((message.payload as { text: string }).text).toContain('ya no está disponible');
    expect((message.payload as { text: string }).text).toContain('Cabaña B');
  });

  it('rechaza un resourceId de otro Business antes de Pricing', async () => {
    const first = await business('Pricing Tenant A');
    const second = await business('Pricing Tenant B');
    const foreign = await resource(second.id, 'Resource privado B', 2);
    const quote = { quote: jest.fn() } as never;
    const worker = botWithAvailability(availability, quote).dispatcher;

    await beginAvailability(first.id, worker, 'wamid-cross-tenant');
    await sendAndDispatch(first.id, worker, 'wamid-cross-tenant-guests', '2');
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { businessId: first.id } });
    await prisma.conversationSession.update({ where: { conversationId_businessId: { conversationId: conversation.id, businessId: first.id } }, data: { context: { availability: { checkIn: '2026-10-15', checkOut: '2026-10-17', guests: 2, options: [{ option: 1, resourceId: foreign.id, name: foreign.name }] } } } });
    await sendAndDispatch(first.id, worker, 'wamid-cross-tenant-choice', '1');

    expect((quote as { quote: jest.Mock }).quote).not.toHaveBeenCalled();
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: first.id } })).resolves.toMatchObject({ state: 'AVAILABILITY_RESULTS' });
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: first.id }, orderBy: { createdAt: 'desc' } });
    expect((message.payload as { text: string }).text).not.toContain('Resource privado B');
  });

  it('maneja la ausencia de tarifas sin confundirla con falta de Availability', async () => {
    const owner = await business('No Pricing');
    await resource(owner.id, 'Cabaña sin tarifa', 2);
    const worker = bot().dispatcher;

    await beginAvailability(owner.id, worker, 'wamid-no-pricing');
    await sendAndDispatch(owner.id, worker, 'wamid-no-pricing-guests', '2');
    await sendAndDispatch(owner.id, worker, 'wamid-no-pricing-choice', '1');

    const session = await prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } });
    expect(session.state).toBe('AVAILABILITY_RESULTS');
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: owner.id }, orderBy: { createdAt: 'desc' } });
    expect((message.payload as { text: string }).text).toContain('No pude obtener una cotización');
    expect((message.payload as { text: string }).text).not.toContain('No encontré disponibilidad');
  });

  it('0 desde Pricing refresca Availability y limpia selection/pricing', async () => {
    const owner = await business('Quote Back');
    const selected = await resource(owner.id, 'Cabaña con tarifa', 2);
    await ratePlan(owner.id, selected.id);
    const worker = bot().dispatcher;

    await beginAvailability(owner.id, worker, 'wamid-quote-back');
    await sendAndDispatch(owner.id, worker, 'wamid-quote-back-guests', '2');
    await sendAndDispatch(owner.id, worker, 'wamid-quote-back-choice', '1');
    await sendAndDispatch(owner.id, worker, 'wamid-quote-back-zero', '0');

    const session = await prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } });
    expect(session.state).toBe('AVAILABILITY_RESULTS');
    expect(session.context).not.toHaveProperty('selection');
    expect(session.context).not.toHaveProperty('pricing');
    expect(session.context).toMatchObject({ availability: { options: [{ resourceId: selected.id }] } });
  });

  it('aisla la consulta de Availability por Business', async () => {
    const first = await business('Availability A');
    const second = await business('Availability B');
    await resource(second.id, 'Resource privado B', 4);
    const worker = bot().dispatcher;
    await beginAvailability(first.id, worker, 'wamid-tenant-availability');
    await sendAndDispatch(first.id, worker, 'wamid-tenant-availability-guests', '2');

    const last = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: first.id }, orderBy: { createdAt: 'desc' } });
    expect((last.payload as { text: string }).text).toContain('No encontré disponibilidad');
    expect((last.payload as { text: string }).text).not.toContain('Resource privado B');
  });

  it('opción 4 transfiere a HUMAN y envía el cierre del bot', async () => {
    const owner = await business();
    const worker = bot().dispatcher;
    await receive(owner.id, 'wamid-handoff-a');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-handoff-b', '4');
    await worker.dispatchOnce();

    await expect(prisma.conversation.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ mode: 'HUMAN' });
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'HUMAN_HANDOFF' });
    await expect(prisma.outboundMessage.findMany({ where: { businessId: owner.id } })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ payload: { text: 'Te estamos comunicando con una persona.' } })]));
  });

  it('no responde nuevos mensajes mientras la conversación está en HUMAN', async () => {
    const owner = await business();
    const worker = bot().dispatcher;
    await receive(owner.id, 'wamid-human-a');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-human-b', '4');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-human-c', '1');
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');

    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(2);
  });

  it('al volver de HUMAN a BOT conserva el menú', async () => {
    const owner = await business();
    const worker = bot().dispatcher;
    const first = await receive(owner.id, 'wamid-return-a');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-return-b', '4');
    await worker.dispatchOnce();
    const changeMode = new ChangeConversationModeUseCase(conversations);
    await changeMode.execute({ businessId: owner.id, conversationId: first.result.conversation.id, mode: ConversationMode.BOT });
    await receive(owner.id, 'wamid-return-c', '2');
    await worker.dispatchOnce();

    const messages = await prisma.outboundMessage.findMany({ where: { businessId: owner.id }, orderBy: { createdAt: 'asc' } });
    expect((messages[2].payload as { text: string }).text).toContain('creación de reservas');
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  it('reentrega el mismo IntegrationEvent sin duplicar ni avanzar otra vez', async () => {
    const owner = await business();
    const received = await receive(owner.id, 'wamid-idempotent');
    const { consumer, dispatcher } = bot();
    await expect(dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    await consumer.handle(await eventAsContract(received.event.eventId));

    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(1);
    await expect(prisma.conversationBotEvent.count({ where: { businessId: owner.id } })).resolves.toBe(1);
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  it('revierte sesión y marcador si falla la creación transaccional de OutboundMessage', async () => {
    const owner = await business();
    const received = await receive(owner.id, 'wamid-atomic-bot');
    const failingMessages = { createPendingInTransaction: jest.fn().mockRejectedValue(new Error('forced outbound failure')) } as never;
    const transaction = new PrismaConversationBotTransaction(prisma, failingMessages, availability, pricing);

    await expect(transaction.process({ event: await eventAsContract(received.event.eventId), businessName: owner.name, businessTimeZone: 'America/Asuncion' })).rejects.toThrow('forced outbound failure');
    await expect(prisma.conversationSession.count({ where: { businessId: owner.id } })).resolves.toBe(0);
    await expect(prisma.conversationBotEvent.count({ where: { businessId: owner.id } })).resolves.toBe(0);
    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(0);
  });

  it('preserva businessId y nombre en respuestas de negocios distintos', async () => {
    const first = await business('Negocio A');
    const second = await business('Negocio B');
    const worker = bot().dispatcher;
    await receive(first.id, 'wamid-tenant-a');
    await receive(second.id, 'wamid-tenant-b');
    await worker.dispatchAvailable(2);

    const firstMessage = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: first.id } });
    const secondMessage = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: second.id } });
    expect(firstMessage.businessId).toBe(first.id);
    expect((firstMessage.payload as { text: string }).text).toContain(first.name);
    expect((firstMessage.payload as { text: string }).text).not.toContain(second.name);
    expect(secondMessage.businessId).toBe(second.id);
    expect((secondMessage.payload as { text: string }).text).toContain(second.name);
  });

  it('entrega el OutboundMessage PENDING al FakeMessagingProvider y luego SENT', async () => {
    const owner = await business();
    const received = await receive(owner.id, 'wamid-provider');
    await expect(bot().dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: owner.id, integrationEventId: received.event.eventId } });
    const provider = new FakeMessagingProvider();
    const sender = new SendOutboundMessageUseCase(new PrismaOutboundMessageRepository(prisma), provider);

    await expect(sender.execute({ id: message.id, businessId: owner.id })).resolves.toBe(`fake-provider-${message.id}`);
    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({ status: 'SENT', providerMessageId: `fake-provider-${message.id}` });
    expect(provider.sent).toHaveLength(1);
  });
});
