export interface MessagingSecretStore {
  isWritable?(): boolean;
  getSecret(reference: string): Promise<string | null>;
  putSecret(input: { connectionId: string; provider: string; credentialType: string }, value: string): Promise<{ reference: string }>;
  deleteSecret(reference: string): Promise<void>;
}

export const MESSAGING_SECRET_STORE = Symbol('MESSAGING_SECRET_STORE');
