import { FetchMetaWhatsAppEmbeddedSignupClient, MetaWhatsAppEmbeddedSignupError } from './meta-whatsapp-embedded-signup.client';
import type { MetaWhatsAppHttpClient, MetaWhatsAppHttpRequest, MetaWhatsAppHttpResponse } from './meta-whatsapp-http-client';

class FakeHttp implements MetaWhatsAppHttpClient {
  readonly gets: Array<{ url: string; request: MetaWhatsAppHttpRequest }> = [];
  readonly posts: Array<{ url: string; request: MetaWhatsAppHttpRequest }> = [];
  getResponse: MetaWhatsAppHttpResponse = { status: 200, body: {} };
  postResponse: MetaWhatsAppHttpResponse = { status: 200, body: { success: true } };
  get(url: string, request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse> { this.gets.push({ url, request }); return Promise.resolve(this.getResponse); }
  post(url: string, request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse> { this.posts.push({ url, request }); return Promise.resolve(this.postResponse); }
}

const configuration = { environment: 'test' as const, graphApiVersion: 'v26.0', appId: 'app-id', appSecret: 'app-secret-never-logged', configurationId: 'config-id', attemptTtlSeconds: 600, processingTimeoutSeconds: 300 };

describe('FetchMetaWhatsAppEmbeddedSignupClient', () => {
  it('intercambia el code y normaliza token y expiración', async () => {
    const http = new FakeHttp();
    http.getResponse = { status: 200, body: { access_token: 'business-token', expires_in: 3600 } };
    const now = new Date('2026-10-04T12:00:00.000Z');
    const client = new FetchMetaWhatsAppEmbeddedSignupClient(configuration, http, 1000, () => now);
    await expect(client.exchangeCode({ code: 'one-time-code' })).resolves.toEqual({ token: 'business-token', issuedAt: now, expiresAt: new Date('2026-10-04T13:00:00.000Z') });
    expect(http.gets[0].url).toContain('/v26.0/oauth/access_token?');
    expect(http.gets[0].url).toContain('client_id=app-id');
    expect(http.gets[0].url).not.toContain('business-token');
  });

  it('valida WABA y phone number mediante consultas server-side', async () => {
    const http = new FakeHttp();
    http.getResponse = { status: 200, body: { id: 'waba-1', data: [{ id: 'phone-1' }] } };
    const client = new FetchMetaWhatsAppEmbeddedSignupClient(configuration, http);
    await expect(client.validateAssets({ accessToken: 'business-token', providerWabaId: 'waba-1', providerPhoneNumberId: 'phone-1', providerBusinessPortfolioId: 'browser-value' })).resolves.toEqual({ providerWabaId: 'waba-1', providerPhoneNumberId: 'phone-1', providerBusinessPortfolioId: null });
    expect(http.gets).toHaveLength(2);
    expect(http.gets.every((request) => request.request.headers.Authorization === 'Bearer business-token')).toBe(true);
  });

  it('acepta una suscripción ya existente como operación idempotente', async () => {
    const http = new FakeHttp();
    http.postResponse = { status: 400, body: { error: { message: 'The app is already subscribed to this WABA.' } } };
    await expect(new FetchMetaWhatsAppEmbeddedSignupClient(configuration, http).subscribeToWaba({ accessToken: 'business-token', providerWabaId: 'waba-1' })).resolves.toBeUndefined();
  });

  it('normaliza errores Meta sin exponer el token ni el body crudo', async () => {
    const http = new FakeHttp();
    http.getResponse = { status: 400, body: { error: { code: 10, type: 'OAuthException', message: 'Invalid business-token', fbtrace_id: 'private-trace' } } };
    const client = new FetchMetaWhatsAppEmbeddedSignupClient(configuration, http);
    const result = client.exchangeCode({ code: 'one-time-code' });
    await expect(result).rejects.toBeInstanceOf(MetaWhatsAppEmbeddedSignupError);
    await expect(result).rejects.not.toThrow('business-token');
    await expect(result).rejects.not.toThrow('private-trace');
  });
});
