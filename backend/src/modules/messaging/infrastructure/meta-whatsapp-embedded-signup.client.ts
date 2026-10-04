import type { MetaWhatsAppEmbeddedSignupConfiguration } from '../../../config/environment';
import type { MetaWhatsAppEmbeddedSignupClient, MetaWhatsAppTokenResult, MetaWhatsAppValidatedAssets } from '../application/meta-whatsapp-embedded-signup.client';
import type { MetaWhatsAppHttpClient, MetaWhatsAppHttpRequest, MetaWhatsAppHttpResponse } from './meta-whatsapp-http-client';

export type MetaWhatsAppEmbeddedSignupErrorKind = 'configuration' | 'code_exchange' | 'asset_validation' | 'subscription' | 'network' | 'timeout';

export class MetaWhatsAppEmbeddedSignupError extends Error {
  constructor(readonly kind: MetaWhatsAppEmbeddedSignupErrorKind, message: string, readonly status?: number, readonly code?: number) {
    super(message);
    this.name = 'MetaWhatsAppEmbeddedSignupError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class FetchMetaWhatsAppEmbeddedSignupClient implements MetaWhatsAppEmbeddedSignupClient {
  constructor(
    private readonly configuration: MetaWhatsAppEmbeddedSignupConfiguration,
    private readonly http: MetaWhatsAppHttpClient,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async exchangeCode(input: { code: string }): Promise<MetaWhatsAppTokenResult> {
    if (!this.configuration.appId || !this.configuration.appSecret) throw new MetaWhatsAppEmbeddedSignupError('configuration', 'La configuración server-side de Embedded Signup no está disponible.');
    const query = new URLSearchParams({ client_id: this.configuration.appId, client_secret: this.configuration.appSecret, code: input.code });
    const response = await this.request('GET', `oauth/access_token?${query.toString()}`, 'code_exchange');
    const body = record(response.body);
    const token = text(body?.access_token);
    if (!token) throw new MetaWhatsAppEmbeddedSignupError('code_exchange', 'Meta no devolvió un token válido.', response.status);
    const issuedAt = this.now();
    const expiresIn = number(body?.expires_in);
    return { token, issuedAt, expiresAt: expiresIn === undefined ? null : new Date(issuedAt.getTime() + expiresIn * 1000) };
  }

  async validateAssets(input: { accessToken: string; providerWabaId: string; providerPhoneNumberId: string; providerBusinessPortfolioId?: string }): Promise<MetaWhatsAppValidatedAssets> {
    const wabaResponse = await this.request('GET', `${encodeURIComponent(input.providerWabaId)}?fields=id`, 'asset_validation', input.accessToken);
    const waba = record(wabaResponse.body);
    if (text(waba?.id) !== input.providerWabaId) throw new MetaWhatsAppEmbeddedSignupError('asset_validation', 'El WABA de Meta no pudo ser validado.', wabaResponse.status);

    const phonesResponse = await this.request('GET', `${encodeURIComponent(input.providerWabaId)}/phone_numbers?fields=id`, 'asset_validation', input.accessToken);
    const phones = record(phonesResponse.body)?.data;
    const belongsToWaba = Array.isArray(phones) && phones.some((phone) => text(record(phone)?.id) === input.providerPhoneNumberId);
    if (!belongsToWaba) throw new MetaWhatsAppEmbeddedSignupError('asset_validation', 'El phone number de Meta no pertenece al WABA validado.', phonesResponse.status);

    return { providerWabaId: input.providerWabaId, providerPhoneNumberId: input.providerPhoneNumberId, providerBusinessPortfolioId: null };
  }

  async subscribeToWaba(input: { accessToken: string; providerWabaId: string }): Promise<void> {
    try {
      await this.request('POST', `${encodeURIComponent(input.providerWabaId)}/subscribed_apps`, 'subscription', input.accessToken, '{}');
    } catch (error: unknown) {
      if (error instanceof MetaWhatsAppEmbeddedSignupError && error.message === 'La aplicación ya está suscrita al WABA.') return;
      throw error;
    }
  }

  private async request(method: 'GET' | 'POST', path: string, kind: 'code_exchange' | 'asset_validation' | 'subscription', accessToken?: string, body?: string): Promise<MetaWhatsAppHttpResponse> {
    const base = `https://graph.facebook.com/${encodeURIComponent(this.configuration.graphApiVersion)}/`;
    const request: MetaWhatsAppHttpRequest = { headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: body ?? '', signal: AbortSignal.timeout(this.timeoutMs) };
    return method === 'GET' ? this.requestGet(base, path, kind, request) : this.requestPost(base, path, kind, request);
  }

  private async requestGet(base: string, path: string, kind: 'code_exchange' | 'asset_validation' | 'subscription', request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse> {
    const get = this.http.get?.bind(this.http);
    if (!get) throw new MetaWhatsAppEmbeddedSignupError('configuration', 'El cliente HTTP de Meta no soporta consultas GET.');
    return this.executeRequest(() => get(`${base}${path}`, request), kind);
  }

  private async requestPost(base: string, path: string, kind: 'code_exchange' | 'asset_validation' | 'subscription', request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse> {
    return this.executeRequest(() => this.http.post(`${base}${path}`, request), kind);
  }

  private async executeRequest(operation: () => Promise<MetaWhatsAppHttpResponse>, kind: 'code_exchange' | 'asset_validation' | 'subscription'): Promise<MetaWhatsAppHttpResponse> {
    try {
      const response = await operation();
      if (response.status >= 400) throw this.errorFromResponse(response, kind);
      return response;
    } catch (error: unknown) {
      if (error instanceof MetaWhatsAppEmbeddedSignupError) throw error;
      if (isTimeoutError(error)) throw new MetaWhatsAppEmbeddedSignupError('timeout', 'La solicitud a Meta para Embedded Signup agotó el tiempo de espera.');
      throw new MetaWhatsAppEmbeddedSignupError('network', 'No se pudo conectar con Meta para Embedded Signup.');
    }
  }

  private errorFromResponse(response: MetaWhatsAppHttpResponse, kind: 'code_exchange' | 'asset_validation' | 'subscription'): MetaWhatsAppEmbeddedSignupError {
    const error = record(record(response.body)?.error);
    const code = number(error?.code);
    const message = text(error?.message);
    if (kind === 'subscription' && message && /already\s+subscrib/i.test(message)) return new MetaWhatsAppEmbeddedSignupError(kind, 'La aplicación ya está suscrita al WABA.', response.status, code);
    return new MetaWhatsAppEmbeddedSignupError(kind, message ? `Meta rechazó la operación de Embedded Signup (HTTP ${response.status}).` : `Meta rechazó la operación de Embedded Signup (HTTP ${response.status}).`, response.status, code);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === 'TimeoutError' || candidate.name === 'AbortError' || candidate.code === 'ETIMEDOUT';
}
