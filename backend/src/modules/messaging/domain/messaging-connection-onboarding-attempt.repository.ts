import { MessagingChannel } from './messaging-channel.enum';
import { MessagingConnectionOnboardingStatus } from './messaging-connection-onboarding-status.enum';
import { MessagingConnectionProvider } from './messaging-provider.enum';

export interface MessagingConnectionOnboardingAttemptRecord {
  id: string;
  businessId: string;
  initiatedByUserId: string | null;
  provider: MessagingConnectionProvider;
  channel: MessagingChannel;
  stateHash: string;
  status: MessagingConnectionOnboardingStatus;
  expiresAt: Date;
  processingStartedAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  connectionId: string | null;
}

export interface MessagingConnectionOnboardingAttemptRepository {
  create(input: {
    businessId: string;
    initiatedByUserId?: string | null;
    provider: MessagingConnectionProvider;
    channel: MessagingChannel;
    stateHash: string;
    expiresAt: Date;
  }): Promise<MessagingConnectionOnboardingAttemptRecord>;
  findByIdAndBusiness(input: { attemptId: string; businessId: string }): Promise<MessagingConnectionOnboardingAttemptRecord | null>;
  claim(input: { attemptId: string; businessId: string; stateHash: string; now: Date; processingTimeoutMs: number }): Promise<boolean>;
  markCompleted(input: { attemptId: string; businessId: string; connectionId: string; completedAt: Date }): Promise<void>;
  markFailed(input: { attemptId: string; businessId: string }): Promise<void>;
  markExpired(input: { attemptId: string; businessId: string }): Promise<void>;
}

export const MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY = Symbol('MESSAGING_CONNECTION_ONBOARDING_ATTEMPT_REPOSITORY');
