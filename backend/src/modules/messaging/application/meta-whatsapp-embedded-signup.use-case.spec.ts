import { createHash } from 'node:crypto';
import { CompleteMetaWhatsAppEmbeddedSignupUseCase } from './complete-meta-whatsapp-embedded-signup.use-case';
import { type ExistingMessagingConnection, type MessagingConnectionOnboardingTransaction, type MetaWhatsAppEmbeddedSignupConfiguration } from './messaging-embedded-signup.contract';
import { MetaWhatsAppEmbeddedSignupProductionDisabledError } from './meta-whatsapp-embedded-signup.errors';
import { StartMetaWhatsAppEmbeddedSignupUseCase } from './start-meta-whatsapp-embedded-signup.use-case';
import type { MetaWhatsAppEmbeddedSignupClient } from './meta-whatsapp-embedded-signup.client';
import type { MessagingSecretStore } from './messaging-secret-store';
import type { MessagingConnectionOnboardingAttemptRecord, MessagingConnectionOnboardingAttemptRepository } from '../domain/messaging-connection-onboarding-attempt.repository';
import { MessagingConnectionOnboardingStatus } from '../domain/messaging-connection-onboarding-status.enum';

/* Los dobles de prueba implementan contratos asíncronos sin I/O real. */
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

const businessId = '11111111-1111-4111-8111-111111111111';
const otherBusinessId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-04T12:00:00.000Z');

class FixedClock { now(): Date { return new Date(now); } }

class FakeSecretStore implements MessagingSecretStore {
  readonly values = new Map<string, string>();
  readonly putSecret = jest.fn(async (input: { connectionId: string; provider: string; credentialType: string }, value: string) => { const reference = `fake://${input.connectionId}/${this.values.size + 1}`; this.values.set(reference, value); return { reference }; });
  readonly deleteSecret = jest.fn(async (reference: string) => { this.values.delete(reference); });
  isWritable(): boolean { return true; }
  getSecret(reference: string): Promise<string | null> { return Promise.resolve(this.values.get(reference) ?? null); }
}

class FakeAttempts implements MessagingConnectionOnboardingAttemptRepository {
  readonly rows = new Map<string, MessagingConnectionOnboardingAttemptRecord>();
  private sequence = 0;

  async create(input: { businessId: string; initiatedByUserId?: string | null; provider: any; channel: any; stateHash: string; expiresAt: Date }): Promise<MessagingConnectionOnboardingAttemptRecord> {
    const row: MessagingConnectionOnboardingAttemptRecord = { id: `attempt-${++this.sequence}`, businessId: input.businessId, initiatedByUserId: input.initiatedByUserId ?? null, provider: input.provider, channel: input.channel, stateHash: input.stateHash, status: MessagingConnectionOnboardingStatus.PENDING, expiresAt: input.expiresAt, processingStartedAt: null, createdAt: now, completedAt: null, connectionId: null };
    this.rows.set(row.id, row);
    return row;
  }
  findByIdAndBusiness(input: { attemptId: string; businessId: string }): Promise<MessagingConnectionOnboardingAttemptRecord | null> { const row = this.rows.get(input.attemptId); return Promise.resolve(row && row.businessId === input.businessId ? { ...row } : null); }
  async claim(input: { attemptId: string; businessId: string; stateHash: string; now: Date }): Promise<boolean> { const row = this.rows.get(input.attemptId); if (!row || row.businessId !== input.businessId || row.stateHash !== input.stateHash || row.status !== MessagingConnectionOnboardingStatus.PENDING || row.expiresAt <= input.now) return false; row.status = MessagingConnectionOnboardingStatus.PROCESSING; row.processingStartedAt = input.now; return true; }
  async markCompleted(input: { attemptId: string; businessId: string; connectionId: string; completedAt: Date }): Promise<void> { const row = this.rows.get(input.attemptId)!; row.status = MessagingConnectionOnboardingStatus.COMPLETED; row.connectionId = input.connectionId; row.completedAt = input.completedAt; }
  async markFailed(input: { attemptId: string }): Promise<void> { const row = this.rows.get(input.attemptId)!; row.status = MessagingConnectionOnboardingStatus.FAILED; }
  async markExpired(input: { attemptId: string }): Promise<void> { const row = this.rows.get(input.attemptId)!; row.status = MessagingConnectionOnboardingStatus.EXPIRED; }
}

class FakeOnboardingTransaction implements MessagingConnectionOnboardingTransaction {
  existing: ExistingMessagingConnection | null = null;
  completed: Array<Record<string, unknown>> = [];
  async findExistingConnection(): Promise<ExistingMessagingConnection | null> { return this.existing; }
  async findConnectionForProviderPhone(): Promise<ExistingMessagingConnection | null> { return this.existing; }
  async complete(input: Record<string, unknown>): Promise<{ connectionId: string; previousSecretReference: string | null }> { this.completed.push(input); return { connectionId: input.connectionId as string, previousSecretReference: this.existing ? 'fake://old' : null }; }
}

const configuration: MetaWhatsAppEmbeddedSignupConfiguration = { environment: 'test', graphApiVersion: 'v26.0', appId: 'app-id', appSecret: 'app-secret', configurationId: 'config-id', attemptTtlSeconds: 600, processingTimeoutSeconds: 300 };

function createHarness() {
  const attempts = new FakeAttempts();
  const secrets = new FakeSecretStore();
  const meta: jest.Mocked<MetaWhatsAppEmbeddedSignupClient> = { exchangeCode: jest.fn().mockResolvedValue({ token: 'business-token', issuedAt: now, expiresAt: null }), validateAssets: jest.fn().mockResolvedValue({ providerWabaId: 'waba-1', providerPhoneNumberId: 'phone-1', providerBusinessPortfolioId: null }), subscribeToWaba: jest.fn().mockResolvedValue(undefined) };
  const onboarding = new FakeOnboardingTransaction();
  const start = new StartMetaWhatsAppEmbeddedSignupUseCase(attempts, new FixedClock(), configuration, secrets);
  const complete = new CompleteMetaWhatsAppEmbeddedSignupUseCase(attempts, onboarding, meta, secrets, new FixedClock(), configuration);
  return { attempts, secrets, meta, onboarding, start, complete };
}

describe('Meta WhatsApp Embedded Signup use cases', () => {
  it('crea un attempt con state único, hash persistido y TTL', async () => {
    const { start, attempts } = createHarness();
    const result = await start.execute({ businessId, initiatedByUserId: 'user-1' });
    const row = attempts.rows.get(result.attemptId)!;
    expect(result.state).not.toBe(row.stateHash);
    expect(row.stateHash).toBe(createHash('sha256').update(result.state).digest('hex'));
    expect(row.expiresAt).toEqual(new Date('2026-10-04T12:10:00.000Z'));
  });

  it('rechaza state incorrecto y no llama Meta', async () => {
    const { start, complete, meta } = createHarness();
    const attempt = await start.execute({ businessId });
    await expect(complete.execute({ businessId, attemptId: attempt.attemptId, state: 'wrong-state', code: 'one-time-code', sessionInfo: { providerPhoneNumberId: 'phone-1', providerWabaId: 'waba-1' } })).rejects.toThrow('state');
    expect(meta.exchangeCode).not.toHaveBeenCalled();
  });

  it('rechaza attempt expirado sin intercambiar code', async () => {
    const { start, complete, meta, attempts } = createHarness();
    const attempt = await start.execute({ businessId });
    attempts.rows.get(attempt.attemptId)!.expiresAt = new Date('2026-10-04T11:59:00.000Z');
    await expect(complete.execute({ businessId, attemptId: attempt.attemptId, state: attempt.state, code: 'one-time-code', sessionInfo: { providerPhoneNumberId: 'phone-1', providerWabaId: 'waba-1' } })).rejects.toThrow('expiró');
    expect(meta.exchangeCode).not.toHaveBeenCalled();
  });

  it('completa validando assets server-side y no persiste datos browser no validados', async () => {
    const { start, complete, meta, onboarding, secrets } = createHarness();
    const attempt = await start.execute({ businessId });
    await expect(complete.execute({ businessId, attemptId: attempt.attemptId, state: attempt.state, code: 'one-time-code', sessionInfo: { providerPhoneNumberId: 'phone-1', providerWabaId: 'waba-1', providerBusinessPortfolioId: 'browser-only' } })).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(meta.exchangeCode).toHaveBeenCalledTimes(1);
    expect(meta.validateAssets).toHaveBeenCalledWith(expect.objectContaining({ providerBusinessPortfolioId: 'browser-only' }));
    expect(onboarding.completed[0]).toMatchObject({ providerBusinessPortfolioId: null });
    expect([...secrets.values.values()]).toEqual(['business-token']);
  });

  it('completion duplicado devuelve el resultado previo sin volver a intercambiar code', async () => {
    const { start, complete, meta, attempts } = createHarness();
    const attempt = await start.execute({ businessId });
    const input = { businessId, attemptId: attempt.attemptId, state: attempt.state, code: 'one-time-code', sessionInfo: { providerPhoneNumberId: 'phone-1', providerWabaId: 'waba-1' } };
    const first = await complete.execute(input);
    attempts.rows.get(attempt.attemptId)!.status = MessagingConnectionOnboardingStatus.COMPLETED;
    attempts.rows.get(attempt.attemptId)!.connectionId = first.connectionId;
    await expect(complete.execute(input)).resolves.toMatchObject({ connectionId: expect.any(String) });
    expect(meta.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it('rechaza un phone number ya vinculado a otro Business', async () => {
    const { start, complete, onboarding, meta, secrets, attempts } = createHarness();
    onboarding.existing = { id: 'connection-other', businessId: otherBusinessId, providerPhoneNumberId: 'phone-1', providerWabaId: 'waba-old', providerBusinessPortfolioId: null, status: 'ACTIVE' };
    const attempt = await start.execute({ businessId });
    await expect(complete.execute({ businessId, attemptId: attempt.attemptId, state: attempt.state, code: 'one-time-code', sessionInfo: { providerPhoneNumberId: 'phone-1', providerWabaId: 'waba-1' } })).rejects.toThrow('otro Business');
    expect(meta.validateAssets).not.toHaveBeenCalled();
    expect(secrets.putSecret).not.toHaveBeenCalled();
    expect(attempts.rows.get(attempt.attemptId)?.status).toBe(MessagingConnectionOnboardingStatus.FAILED);
  });

  it('compensa el secret si la suscripción Meta falla', async () => {
    const { start, complete, meta, secrets, attempts } = createHarness();
    meta.subscribeToWaba.mockRejectedValue(new Error('subscription failed'));
    const attempt = await start.execute({ businessId });
    await expect(complete.execute({ businessId, attemptId: attempt.attemptId, state: attempt.state, code: 'one-time-code', sessionInfo: { providerPhoneNumberId: 'phone-1', providerWabaId: 'waba-1' } })).rejects.toThrow('No se pudo completar');
    expect(secrets.deleteSecret).toHaveBeenCalledTimes(1);
    expect(attempts.rows.get(attempt.attemptId)?.status).toBe(MessagingConnectionOnboardingStatus.FAILED);
  });

  it('bloquea start en producción sin SecretStore writable', async () => {
    const { attempts } = createHarness();
    const unavailable: MessagingSecretStore = { getSecret: () => Promise.resolve(null), putSecret: jest.fn(), deleteSecret: jest.fn(), isWritable: () => false };
    const production = new StartMetaWhatsAppEmbeddedSignupUseCase(attempts, new FixedClock(), { ...configuration, environment: 'production' }, unavailable);
    await expect(production.execute({ businessId })).rejects.toBeInstanceOf(MetaWhatsAppEmbeddedSignupProductionDisabledError);
    expect(attempts.rows.size).toBe(0);
  });
});
