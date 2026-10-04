import { PrismaClient } from '@prisma/client';
import { CompleteMetaWhatsAppEmbeddedSignupUseCase } from '../../src/modules/messaging/application/complete-meta-whatsapp-embedded-signup.use-case';
import type { MetaWhatsAppEmbeddedSignupClient } from '../../src/modules/messaging/application/meta-whatsapp-embedded-signup.client';
import { StartMetaWhatsAppEmbeddedSignupUseCase } from '../../src/modules/messaging/application/start-meta-whatsapp-embedded-signup.use-case';
import { MessagingConnectionOnboardingStatus } from '../../src/modules/messaging/domain/messaging-connection-onboarding-status.enum';
import { PrismaMessagingConnectionOnboardingAttemptRepository } from '../../src/modules/messaging/infrastructure/prisma-messaging-connection-onboarding-attempt.repository';
import { PrismaMessagingConnectionOnboardingTransaction } from '../../src/modules/messaging/infrastructure/prisma-messaging-connection-onboarding.transaction';
import { InMemoryMessagingSecretStore } from '../../src/modules/messaging/infrastructure/in-memory-messaging-secret.store';
import { cleanTestDatabase } from './support/clean-test-database';

/* Los dobles Meta del test representan respuestas asíncronas sin red real. */
/* eslint-disable @typescript-eslint/require-await */

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
const businessId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-10-04T12:00:00.000Z');

class FixedClock { now(): Date { return new Date(now); } }

class FakeMetaClient implements MetaWhatsAppEmbeddedSignupClient {
  exchangeCalls = 0;
  validateCalls = 0;
  subscribeCalls = 0;
  async exchangeCode(): Promise<{ token: string; issuedAt: Date; expiresAt: Date | null }> { this.exchangeCalls++; return { token: `business-token-${this.exchangeCalls}`, issuedAt: now, expiresAt: null }; }
  async validateAssets(input: { providerWabaId: string; providerPhoneNumberId: string }): Promise<{ providerWabaId: string; providerPhoneNumberId: string; providerBusinessPortfolioId: string | null }> { this.validateCalls++; return { providerWabaId: input.providerWabaId, providerPhoneNumberId: input.providerPhoneNumberId, providerBusinessPortfolioId: 'portfolio-server' }; }
  async subscribeToWaba(): Promise<void> { this.subscribeCalls++; }
}

describeWithPostgres('Messaging Embedded Signup PostgreSQL', () => {
  const prisma = new PrismaClient();
  const attempts = new PrismaMessagingConnectionOnboardingAttemptRepository(prisma);
  const onboarding = new PrismaMessagingConnectionOnboardingTransaction(prisma);
  const secrets = new InMemoryMessagingSecretStore();
  const meta = new FakeMetaClient();
  const configuration = { environment: 'test' as const, graphApiVersion: 'v26.0', appId: 'app-id', appSecret: 'app-secret', configurationId: 'configuration-id', attemptTtlSeconds: 600, processingTimeoutSeconds: 300 };
  const start = new StartMetaWhatsAppEmbeddedSignupUseCase(attempts, new FixedClock(), configuration, secrets);
  const complete = new CompleteMetaWhatsAppEmbeddedSignupUseCase(attempts, onboarding, meta, secrets, new FixedClock(), configuration);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => { await cleanTestDatabase(prisma, databaseUrl); meta.exchangeCalls = 0; meta.validateCalls = 0; meta.subscribeCalls = 0; secrets.clear(); });
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });

  async function business(name: string) { return prisma.business.create({ data: { id: name === 'Owner' ? businessId : crypto.randomUUID(), name: `${name} ${crypto.randomUUID()}` } }); }

  it('persiste attempt tenant-scoped, hash, connection, WABA/Portfolio y credential sin token plaintext', async () => {
    const owner = await business('Owner');
    const started = await start.execute({ businessId: owner.id, initiatedByUserId: 'user-1' });
    const row = await prisma.messagingConnectionOnboardingAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
    expect(row.stateHash).not.toBe(started.state);

    const result = await complete.execute({ businessId: owner.id, attemptId: started.attemptId, state: started.state, code: 'one-time-code', sessionInfo: { providerPhoneNumberId: 'phone-browser', providerWabaId: 'waba-browser', providerBusinessPortfolioId: 'portfolio-browser' } });
    const connection = await prisma.messagingConnection.findUniqueOrThrow({ where: { id: result.connectionId } });
    const credential = await prisma.messagingProviderCredential.findUniqueOrThrow({ where: { connectionId_credentialType: { connectionId: result.connectionId, credentialType: 'BUSINESS_TOKEN' } } });
    const attempt = await prisma.messagingConnectionOnboardingAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
    expect(connection).toMatchObject({ businessId: owner.id, providerPhoneNumberId: 'phone-browser', providerWabaId: 'waba-browser', providerBusinessPortfolioId: 'portfolio-server', status: 'ACTIVE' });
    expect(credential).toMatchObject({ connectionId: result.connectionId, secretReference: expect.stringMatching(/^memory:\/\//), status: 'ACTIVE' });
    expect(credential).not.toHaveProperty('token');
    expect(attempt).toMatchObject({ businessId: owner.id, status: MessagingConnectionOnboardingStatus.COMPLETED, connectionId: result.connectionId });
    expect(meta.exchangeCalls).toBe(1);
  });

  it('reconnecta la misma connection y rota una sola credential', async () => {
    const owner = await business('Owner');
    const first = await start.execute({ businessId: owner.id });
    const firstResult = await complete.execute({ businessId: owner.id, attemptId: first.attemptId, state: first.state, code: 'code-1', sessionInfo: { providerPhoneNumberId: 'phone-browser', providerWabaId: 'waba-browser' } });
    const firstCredential = await prisma.messagingProviderCredential.findUniqueOrThrow({ where: { connectionId_credentialType: { connectionId: firstResult.connectionId, credentialType: 'BUSINESS_TOKEN' } } });
    const second = await start.execute({ businessId: owner.id });
    const secondResult = await complete.execute({ businessId: owner.id, attemptId: second.attemptId, state: second.state, code: 'code-2', sessionInfo: { providerPhoneNumberId: 'phone-browser', providerWabaId: 'waba-browser' } });
    const count = await prisma.messagingConnection.count({ where: { businessId: owner.id } });
    const secondCredential = await prisma.messagingProviderCredential.findUniqueOrThrow({ where: { connectionId_credentialType: { connectionId: secondResult.connectionId, credentialType: 'BUSINESS_TOKEN' } } });
    expect(secondResult.connectionId).toBe(firstResult.connectionId);
    expect(count).toBe(1);
    expect(secondCredential.id).toBe(firstCredential.id);
    expect(secondCredential.rotatedAt).not.toBeNull();
    await expect(secrets.getSecret(firstCredential.secretReference)).resolves.toBeNull();
  });

  it('no permite robar un phone number de otro Business', async () => {
    const owner = await business('Owner');
    const other = await business('Other');
    const first = await start.execute({ businessId: owner.id });
    await complete.execute({ businessId: owner.id, attemptId: first.attemptId, state: first.state, code: 'code-1', sessionInfo: { providerPhoneNumberId: 'phone-browser', providerWabaId: 'waba-browser' } });
    const second = await start.execute({ businessId: other.id });
    await expect(complete.execute({ businessId: other.id, attemptId: second.attemptId, state: second.state, code: 'code-2', sessionInfo: { providerPhoneNumberId: 'phone-browser', providerWabaId: 'waba-browser' } })).rejects.toThrow('otro Business');
    await expect(prisma.messagingConnection.count()).resolves.toBe(1);
  });

  it('un attempt COMPLETED no vuelve a consumir el code ni duplica conexiones', async () => {
    const owner = await business('Owner');
    const started = await start.execute({ businessId: owner.id });
    const input = { businessId: owner.id, attemptId: started.attemptId, state: started.state, code: 'code-1', sessionInfo: { providerPhoneNumberId: 'phone-browser', providerWabaId: 'waba-browser' } };
    const first = await complete.execute(input);
    const second = await complete.execute(input);
    expect(second.connectionId).toBe(first.connectionId);
    expect(meta.exchangeCalls).toBe(1);
    await expect(prisma.messagingConnection.count()).resolves.toBe(1);
  });
});
