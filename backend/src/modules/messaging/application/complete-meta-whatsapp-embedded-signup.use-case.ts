import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MESSAGING_CLOCK, type MessagingClock } from './messaging-clock';
import { MESSAGING_SECRET_STORE, type MessagingSecretStore } from './messaging-secret-store';
import { MESSAGING_CONNECTION_ONBOARDING_TRANSACTION, META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION, type ExistingMessagingConnection, type MessagingConnectionOnboardingTransaction, type MetaWhatsAppEmbeddedSignupConfiguration } from './messaging-embedded-signup.contract';
import { META_WHATSAPP_EMBEDDED_SIGNUP_CLIENT, type MetaWhatsAppEmbeddedSignupClient, type MetaWhatsAppValidatedAssets } from './meta-whatsapp-embedded-signup.client';
import { MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY, type MessagingConnectionOnboardingAttemptRepository } from '../domain/messaging-connection-onboarding-attempt.repository';
import { MessagingConnectionOnboardingStatus } from '../domain/messaging-connection-onboarding-status.enum';
import { MessagingProviderCredentialType } from '../domain/messaging-provider-credential-type.enum';
import { MetaWhatsAppEmbeddedSignupApplicationError, MetaWhatsAppEmbeddedSignupAttemptConsumedError, MetaWhatsAppEmbeddedSignupAttemptExpiredError, MetaWhatsAppEmbeddedSignupAttemptInProgressError, MetaWhatsAppEmbeddedSignupAttemptNotFoundError, MetaWhatsAppEmbeddedSignupBusinessConflictError, MetaWhatsAppEmbeddedSignupCompletionError, MetaWhatsAppEmbeddedSignupProductionDisabledError, MetaWhatsAppEmbeddedSignupInvalidStateError } from './meta-whatsapp-embedded-signup.errors';

@Injectable()
export class CompleteMetaWhatsAppEmbeddedSignupUseCase {
  constructor(
    @Inject(MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY) private readonly attempts: MessagingConnectionOnboardingAttemptRepository,
    @Inject(MESSAGING_CONNECTION_ONBOARDING_TRANSACTION) private readonly onboarding: MessagingConnectionOnboardingTransaction,
    @Inject(META_WHATSAPP_EMBEDDED_SIGNUP_CLIENT) private readonly meta: MetaWhatsAppEmbeddedSignupClient,
    @Inject(MESSAGING_SECRET_STORE) private readonly secrets: MessagingSecretStore,
    @Inject(MESSAGING_CLOCK) private readonly clock: MessagingClock,
    @Inject(META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION) private readonly configuration: MetaWhatsAppEmbeddedSignupConfiguration,
  ) {}

  async execute(input: {
    businessId: string;
    attemptId: string;
    state: string;
    code: string;
    sessionInfo: { providerPhoneNumberId: string; providerWabaId: string; providerBusinessPortfolioId?: string };
  }): Promise<{ connectionId: string; status: 'ACTIVE'; provider: 'META_WHATSAPP'; channel: 'WHATSAPP' }> {
    this.assertProductionSecretStore();
    const attempt = await this.prepareAttempt(input);
    if (attempt.status === MessagingConnectionOnboardingStatus.COMPLETED && attempt.connectionId) return success(attempt.connectionId);
    const claimed = await this.claimAttempt(input, attempt.stateHash);
    if (!claimed) return this.resolveClaimRace(input);
    return this.completeClaimedAttempt(input);
  }

  private assertProductionSecretStore(): void {
    if (this.configuration.environment === 'production' && this.secrets.isWritable?.() !== true) throw new MetaWhatsAppEmbeddedSignupProductionDisabledError();
  }

  private async prepareAttempt(input: { businessId: string; attemptId: string; state: string; code: string; sessionInfo: { providerPhoneNumberId: string; providerWabaId: string; providerBusinessPortfolioId?: string } }) {
    const attempt = await this.attempts.findByIdAndBusiness({ attemptId: input.attemptId, businessId: input.businessId });
    if (!attempt) throw new MetaWhatsAppEmbeddedSignupAttemptNotFoundError();
    if (!safeEqual(attempt.stateHash, stateHash(input.state))) throw new MetaWhatsAppEmbeddedSignupInvalidStateError();
    if (attempt.status === MessagingConnectionOnboardingStatus.EXPIRED || attempt.expiresAt.getTime() <= this.clock.now().getTime()) {
      await this.attempts.markExpired({ attemptId: input.attemptId, businessId: input.businessId });
      throw new MetaWhatsAppEmbeddedSignupAttemptExpiredError();
    }
    if (attempt.status === MessagingConnectionOnboardingStatus.FAILED) throw new MetaWhatsAppEmbeddedSignupAttemptConsumedError();
    return attempt;
  }

  private async claimAttempt(input: { businessId: string; attemptId: string }, stateHashValue: string): Promise<boolean> {
    return this.attempts.claim({ attemptId: input.attemptId, businessId: input.businessId, stateHash: stateHashValue, now: this.clock.now(), processingTimeoutMs: this.configuration.processingTimeoutSeconds * 1000 });
  }

  private async completeClaimedAttempt(input: { businessId: string; attemptId: string; state: string; code: string; sessionInfo: { providerPhoneNumberId: string; providerWabaId: string; providerBusinessPortfolioId?: string } }): Promise<{ connectionId: string; status: 'ACTIVE'; provider: 'META_WHATSAPP'; channel: 'WHATSAPP' }> {
    let secretReference: string | null = null;
    try {
      const token = await this.meta.exchangeCode({ code: input.code });
      const existing = await this.onboarding.findConnectionForProviderPhone({ providerPhoneNumberId: input.sessionInfo.providerPhoneNumberId });
      this.assertBusinessOwnership(existing, input.businessId);
      const assets = await this.meta.validateAssets({ accessToken: token.token, providerWabaId: input.sessionInfo.providerWabaId, providerPhoneNumberId: input.sessionInfo.providerPhoneNumberId, providerBusinessPortfolioId: input.sessionInfo.providerBusinessPortfolioId });
      this.assertSessionMatchesValidatedAssets(input.sessionInfo, assets);
      const connectionId = existing?.id ?? randomUUID();
      const stored = await this.secrets.putSecret({ connectionId, provider: 'META_WHATSAPP', credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN }, token.token);
      secretReference = stored.reference;
      await this.meta.subscribeToWaba({ accessToken: token.token, providerWabaId: assets.providerWabaId });
      const result = await this.onboarding.complete({ attemptId: input.attemptId, businessId: input.businessId, connectionId, providerPhoneNumberId: assets.providerPhoneNumberId, providerWabaId: assets.providerWabaId, providerBusinessPortfolioId: assets.providerBusinessPortfolioId, secretReference, issuedAt: token.issuedAt, expiresAt: token.expiresAt, now: this.clock.now() });
      await this.deleteReplacedSecret(result.previousSecretReference, secretReference);
      return success(result.connectionId);
    } catch (error: unknown) {
      await this.deleteQuietly(secretReference);
      await this.attempts.markFailed({ attemptId: input.attemptId, businessId: input.businessId });
      if (error instanceof MetaWhatsAppEmbeddedSignupApplicationError) throw error;
      throw new MetaWhatsAppEmbeddedSignupCompletionError();
    }
  }

  private async resolveClaimRace(input: { businessId: string; attemptId: string; state: string; code: string; sessionInfo: { providerPhoneNumberId: string; providerWabaId: string; providerBusinessPortfolioId?: string } }): Promise<{ connectionId: string; status: 'ACTIVE'; provider: 'META_WHATSAPP'; channel: 'WHATSAPP' }> {
    const current = await this.attempts.findByIdAndBusiness({ attemptId: input.attemptId, businessId: input.businessId });
    if (current?.status === MessagingConnectionOnboardingStatus.COMPLETED && current.connectionId) return success(current.connectionId);
    if (current?.status === MessagingConnectionOnboardingStatus.EXPIRED) throw new MetaWhatsAppEmbeddedSignupAttemptExpiredError();
    throw new MetaWhatsAppEmbeddedSignupAttemptInProgressError();
  }

  private assertBusinessOwnership(existing: ExistingMessagingConnection | null, businessId: string): void {
    if (existing && existing.businessId !== businessId) throw new MetaWhatsAppEmbeddedSignupBusinessConflictError();
  }

  private assertSessionMatchesValidatedAssets(session: { providerPhoneNumberId: string; providerWabaId: string }, assets: MetaWhatsAppValidatedAssets): void {
    if (assets.providerPhoneNumberId !== session.providerPhoneNumberId || assets.providerWabaId !== session.providerWabaId) throw new MetaWhatsAppEmbeddedSignupCompletionError();
  }

  private async deleteReplacedSecret(previous: string | null, current: string): Promise<void> {
    if (previous && previous !== current) await this.deleteQuietly(previous);
  }

  private async deleteQuietly(reference: string | null): Promise<void> {
    if (!reference) return;
    try { await this.secrets.deleteSecret(reference); } catch { /* La conexión nueva no debe perderse por cleanup best-effort. */ }
  }
}

function stateHash(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function success(connectionId: string): { connectionId: string; status: 'ACTIVE'; provider: 'META_WHATSAPP'; channel: 'WHATSAPP' } {
  return { connectionId, status: 'ACTIVE', provider: 'META_WHATSAPP', channel: 'WHATSAPP' };
}
