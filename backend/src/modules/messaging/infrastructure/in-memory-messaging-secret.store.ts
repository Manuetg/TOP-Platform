import { randomUUID } from 'node:crypto';
import type { MessagingSecretStore } from '../application/messaging-secret-store';

export class InMemoryMessagingSecretStore implements MessagingSecretStore {
  private readonly values = new Map<string, string>();

  clear(): void {
    this.values.clear();
  }

  isWritable(): boolean {
    return true;
  }

  getSecret(reference: string): Promise<string | null> {
    return Promise.resolve(this.values.get(reference) ?? null);
  }

  putSecret(input: { connectionId: string; provider: string; credentialType: string }, value: string): Promise<{ reference: string }> {
    const reference = `memory://messaging/${encodeURIComponent(input.connectionId)}/${encodeURIComponent(input.provider)}/${encodeURIComponent(input.credentialType)}/${randomUUID()}`;
    this.values.set(reference, value);
    return Promise.resolve({ reference });
  }

  deleteSecret(reference: string): Promise<void> {
    this.values.delete(reference);
    return Promise.resolve();
  }
}
