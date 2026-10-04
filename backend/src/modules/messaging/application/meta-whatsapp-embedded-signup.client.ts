export interface MetaWhatsAppEmbeddedSignupClient {
  exchangeCode(input: { code: string }): Promise<MetaWhatsAppTokenResult>;
  validateAssets(input: {
    accessToken: string;
    providerWabaId: string;
    providerPhoneNumberId: string;
    providerBusinessPortfolioId?: string;
  }): Promise<MetaWhatsAppValidatedAssets>;
  subscribeToWaba(input: { accessToken: string; providerWabaId: string }): Promise<void>;
}

export interface MetaWhatsAppTokenResult {
  token: string;
  issuedAt: Date;
  expiresAt: Date | null;
}

export interface MetaWhatsAppValidatedAssets {
  providerWabaId: string;
  providerPhoneNumberId: string;
  providerBusinessPortfolioId: string | null;
}

export const META_WHATSAPP_EMBEDDED_SIGNUP_CLIENT = Symbol('META_WHATSAPP_EMBEDDED_SIGNUP_CLIENT');
