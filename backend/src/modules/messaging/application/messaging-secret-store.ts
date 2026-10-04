export interface MessagingSecretStore {
  getSecret(reference: string): Promise<string | null>;
}

export const MESSAGING_SECRET_STORE = Symbol('MESSAGING_SECRET_STORE');
