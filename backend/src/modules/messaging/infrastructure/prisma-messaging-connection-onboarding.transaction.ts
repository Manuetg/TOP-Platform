import { Injectable } from '@nestjs/common';
import { MessagingProvider, MessagingConnectionStatus, MessagingChannel, MessagingProviderCredentialStatus, MessagingProviderCredentialType } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { ExistingMessagingConnection, MessagingConnectionOnboardingTransaction } from '../application/messaging-embedded-signup.contract';

@Injectable()
export class PrismaMessagingConnectionOnboardingTransaction implements MessagingConnectionOnboardingTransaction {
  constructor(private readonly prisma: PrismaService) {}

  async findExistingConnection(input: { businessId: string; providerPhoneNumberId: string }): Promise<ExistingMessagingConnection | null> {
    const row = await this.prisma.messagingConnection.findFirst({
      where: { businessId: input.businessId, provider: MessagingProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: input.providerPhoneNumberId },
      select: { id: true, businessId: true, providerPhoneNumberId: true, providerWabaId: true, providerBusinessPortfolioId: true, status: true },
    });
    return row ? this.map(row) : null;
  }

  async findConnectionForProviderPhone(input: { providerPhoneNumberId: string }): Promise<ExistingMessagingConnection | null> {
    const row = await this.prisma.messagingConnection.findUnique({
      where: { provider_channel_providerPhoneNumberId: { provider: MessagingProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: input.providerPhoneNumberId } },
      select: { id: true, businessId: true, providerPhoneNumberId: true, providerWabaId: true, providerBusinessPortfolioId: true, status: true },
    });
    return row ? this.map(row) : null;
  }

  async complete(input: {
    attemptId: string;
    businessId: string;
    connectionId: string;
    providerPhoneNumberId: string;
    providerWabaId: string;
    providerBusinessPortfolioId: string | null;
    secretReference: string;
    issuedAt: Date;
    expiresAt: Date | null;
    now: Date;
  }): Promise<{ connectionId: string; previousSecretReference: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.messagingConnectionOnboardingAttempt.findFirst({ where: { id: input.attemptId, businessId: input.businessId, status: 'PROCESSING' } });
      if (!attempt) throw new Error('El intento de onboarding ya no está disponible para completar.');

      const existing = await tx.messagingConnection.findUnique({
        where: { provider_channel_providerPhoneNumberId: { provider: MessagingProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: input.providerPhoneNumberId } },
        select: { id: true, businessId: true },
      });
      if (existing && existing.businessId !== input.businessId) throw new Error('El phone number de Meta ya está vinculado a otro Business.');
      if (existing && existing.id !== input.connectionId) throw new Error('La conexión calculada no coincide con la conexión existente.');

      const connection = existing
        ? await tx.messagingConnection.update({ where: { id: existing.id }, data: { providerWabaId: input.providerWabaId, providerBusinessPortfolioId: input.providerBusinessPortfolioId, status: MessagingConnectionStatus.ACTIVE } })
        : await tx.messagingConnection.create({ data: { id: input.connectionId, businessId: input.businessId, provider: MessagingProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: input.providerPhoneNumberId, providerWabaId: input.providerWabaId, providerBusinessPortfolioId: input.providerBusinessPortfolioId, status: MessagingConnectionStatus.ACTIVE } });

      const previous = await tx.messagingProviderCredential.findUnique({ where: { connectionId_credentialType: { connectionId: connection.id, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN } }, select: { secretReference: true } });
      await tx.messagingProviderCredential.upsert({
        where: { connectionId_credentialType: { connectionId: connection.id, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN } },
        create: { connectionId: connection.id, provider: MessagingProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: input.secretReference, status: MessagingProviderCredentialStatus.ACTIVE, issuedAt: input.issuedAt, expiresAt: input.expiresAt, lastValidatedAt: input.now },
        update: { provider: MessagingProvider.META_WHATSAPP, secretReference: input.secretReference, status: MessagingProviderCredentialStatus.ACTIVE, issuedAt: input.issuedAt, expiresAt: input.expiresAt, lastValidatedAt: input.now, rotatedAt: previous ? input.now : null, revokedAt: null },
      });
      await tx.messagingConnectionOnboardingAttempt.update({ where: { id: input.attemptId }, data: { status: 'COMPLETED', connectionId: connection.id, completedAt: input.now, processingStartedAt: null } });
      return { connectionId: connection.id, previousSecretReference: previous?.secretReference ?? null };
    });
  }

  private map(row: { id: string; businessId: string; providerPhoneNumberId: string; providerWabaId: string | null; providerBusinessPortfolioId: string | null; status: string }): ExistingMessagingConnection {
    return { id: row.id, businessId: row.businessId, providerPhoneNumberId: row.providerPhoneNumberId, providerWabaId: row.providerWabaId, providerBusinessPortfolioId: row.providerBusinessPortfolioId, status: row.status as 'ACTIVE' | 'INACTIVE' };
  }
}
