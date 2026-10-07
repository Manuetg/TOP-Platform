import { planServiceCertificate } from '../domain/finance-recognition.rules';
import { recognitionRequire } from '../domain/finance-recognition.support';
import type { CertifyServiceCommand, RecognitionContext, RecognitionHead, ServiceCertificate } from '../domain/finance-recognition.types';

export interface RecognitionMutation { businessId: string; actorUserId: string; idempotencyKey: string; fingerprint: string; command: CertifyServiceCommand }
export interface RecognitionTransactionScope {
  authorizeOwner(input: RecognitionMutation): Promise<void>;
  readRequest(input: RecognitionMutation): Promise<{ fingerprint: string; certificate: ServiceCertificate } | null>;
  /** Actor/Membership SHARE → Booking UPDATE → Business SHARE; serializa contra CLOSE sin ciclos. */
  lockSources(input: RecognitionMutation): Promise<void>;
  readLockedContext(input: RecognitionMutation): Promise<RecognitionContext>;
  readHead(input: RecognitionMutation): Promise<RecognitionHead | null>;
  assertOpenImpact(input: RecognitionMutation, previous: ServiceCertificate | null, next: ServiceCertificate): Promise<void>;
  appendAndCompareHead(input: RecognitionMutation, certificate: ServiceCertificate, expectedVersion: number): Promise<void>;
  appendAuditAndRequest(input: RecognitionMutation, certificate: ServiceCertificate): Promise<void>;
}
export interface RecognitionTransaction { execute<T>(work: (scope: RecognitionTransactionScope) => Promise<T>): Promise<T> }
export interface RecognitionClock { now(): string }
export interface RecognitionIds { next(): string }

export class CertifyServiceUseCase {
  constructor(private readonly transaction: RecognitionTransaction, private readonly clock: RecognitionClock, private readonly ids: RecognitionIds) {}
  execute(input: RecognitionMutation): Promise<ServiceCertificate> {
    return this.transaction.execute(async scope => {
      await scope.authorizeOwner(input);
      // El puerto toma un lock de request tenant/operation/key y resuelve carreras de retry.
      const prior = await scope.readRequest(input);
      if (prior) {
        recognitionRequire(prior.fingerprint === input.fingerprint, 'IDEMPOTENCY_CONFLICT', 'La clave de reintento pertenece a otra intención.');
        return structuredClone(prior.certificate);
      }
      await scope.lockSources(input);
      const context = await scope.readLockedContext(input);
      const head = await scope.readHead(input);
      const certificate = planServiceCertificate({ id: this.ids.next(), businessId: input.businessId, actorUserId: input.actorUserId, recordedAt: this.clock.now(), command: input.command, context, head });
      await scope.assertOpenImpact(input, head?.certificate ?? null, certificate);
      await scope.appendAndCompareHead(input, certificate, input.command.expectedCertificateVersion);
      await scope.appendAuditAndRequest(input, certificate);
      return structuredClone(certificate);
    });
  }
}
