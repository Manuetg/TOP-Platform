import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MESSAGING_CLOCK, type MessagingClock } from './messaging-clock';
import { MESSAGING_SECRET_STORE, type MessagingSecretStore } from './messaging-secret-store';
import { META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION, type MetaWhatsAppEmbeddedSignupConfiguration } from './messaging-embedded-signup.contract';
import { MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY, type MessagingConnectionOnboardingAttemptRepository } from '../domain/messaging-connection-onboarding-attempt.repository';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';
import { MetaWhatsAppEmbeddedSignupConfigurationError, MetaWhatsAppEmbeddedSignupProductionDisabledError } from './meta-whatsapp-embedded-signup.errors';

@Injectable()
export class StartMetaWhatsAppEmbeddedSignupUseCase {
  constructor(
    @Inject(MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY) private readonly attempts: MessagingConnectionOnboardingAttemptRepository,
    @Inject(MESSAGING_CLOCK) private readonly clock: MessagingClock,
    @Inject(META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION) private readonly configuration: MetaWhatsAppEmbeddedSignupConfiguration,
    @Inject(MESSAGING_SECRET_STORE) private readonly secrets: MessagingSecretStore,
  ) {}

  async execute(input: { businessId: string; initiatedByUserId?: string | null }): Promise<{ attemptId: string; state: string; configurationId: string; expiresAt: Date }> {
    if (!this.configuration.configurationId || !this.configuration.appId || !this.configuration.appSecret) throw new MetaWhatsAppEmbeddedSignupConfigurationError('Falta la configuración server-side de Embedded Signup.');
    if (this.configuration.environment === 'production' && this.secrets.isWritable?.() !== true) throw new MetaWhatsAppEmbeddedSignupProductionDisabledError();
    const state = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.configuration.attemptTtlSeconds * 1000);
    const attempt = await this.attempts.create({ businessId: input.businessId, initiatedByUserId: input.initiatedByUserId ?? null, provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, stateHash: stateHash(state), expiresAt });
    return { attemptId: attempt.id, state, configurationId: this.configuration.configurationId, expiresAt };
  }
}

function stateHash(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}
