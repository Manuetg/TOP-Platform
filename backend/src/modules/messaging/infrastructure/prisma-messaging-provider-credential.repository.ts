import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { MessagingProviderCredentialRecord, MessagingProviderCredentialRepository } from '../domain/messaging-provider-credential.repository';
import { MessagingProviderCredentialStatus } from '../domain/messaging-provider-credential-status.enum';
import { MessagingProviderCredentialType } from '../domain/messaging-provider-credential-type.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

@Injectable()
export class PrismaMessagingProviderCredentialRepository implements MessagingProviderCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForConnection(input: { connectionId: string; businessId: string; credentialType: MessagingProviderCredentialType }): Promise<MessagingProviderCredentialRecord | null> {
    const row = await this.prisma.messagingProviderCredential.findUnique({
      where: { connectionId_credentialType: { connectionId: input.connectionId, credentialType: input.credentialType } },
      include: { connection: { select: { businessId: true } } },
    });
    if (!row || row.connection.businessId !== input.businessId) return null;
    return this.map(row);
  }

  async upsert(input: {
    connectionId: string;
    businessId: string;
    provider: MessagingConnectionProvider;
    credentialType: MessagingProviderCredentialType;
    secretReference: string;
    secretFingerprint?: string | null;
    status?: MessagingProviderCredentialStatus;
    issuedAt?: Date | null;
    expiresAt?: Date | null;
    lastValidatedAt?: Date | null;
    rotatedAt?: Date | null;
    revokedAt?: Date | null;
  }): Promise<MessagingProviderCredentialRecord> {
    const connection = await this.prisma.messagingConnection.findFirst({ where: { id: input.connectionId, businessId: input.businessId }, select: { id: true } });
    if (!connection) throw new Error('La conexión de Messaging no pertenece al negocio indicado.');
    const status = input.status ?? MessagingProviderCredentialStatus.ACTIVE;
    const data = credentialData(input, status);

    const row = await this.prisma.messagingProviderCredential.upsert({
      where: { connectionId_credentialType: { connectionId: input.connectionId, credentialType: input.credentialType } },
      create: {
        connectionId: input.connectionId,
        credentialType: input.credentialType as never,
        ...data,
      },
      update: data,
      include: { connection: { select: { businessId: true } } },
    });
    return this.map(row);
  }

  private map(row: {
    id: string;
    connectionId: string;
    provider: string;
    credentialType: string;
    secretReference: string;
    secretFingerprint: string | null;
    status: string;
    issuedAt: Date | null;
    expiresAt: Date | null;
    lastValidatedAt: Date | null;
    rotatedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    connection: { businessId: string };
  }): MessagingProviderCredentialRecord {
    return {
      id: row.id,
      connectionId: row.connectionId,
      businessId: row.connection.businessId,
      provider: row.provider as MessagingConnectionProvider,
      credentialType: row.credentialType as MessagingProviderCredentialType,
      secretReference: row.secretReference,
      secretFingerprint: row.secretFingerprint,
      status: row.status as MessagingProviderCredentialStatus,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      lastValidatedAt: row.lastValidatedAt,
      rotatedAt: row.rotatedAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function credentialData(input: {
  provider: MessagingConnectionProvider;
  secretReference: string;
  secretFingerprint?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  lastValidatedAt?: Date | null;
  rotatedAt?: Date | null;
  revokedAt?: Date | null;
}, status: MessagingProviderCredentialStatus) {
  return {
    provider: input.provider as never,
    secretReference: input.secretReference,
    secretFingerprint: optional(input.secretFingerprint),
    status: status as never,
    issuedAt: optional(input.issuedAt),
    expiresAt: optional(input.expiresAt),
    lastValidatedAt: optional(input.lastValidatedAt),
    rotatedAt: optional(input.rotatedAt),
    revokedAt: optional(input.revokedAt),
  };
}

function optional<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}
