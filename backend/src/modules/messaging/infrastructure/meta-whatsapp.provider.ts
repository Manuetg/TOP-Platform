import type { MetaWhatsAppConfiguration } from '../../../config/environment';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import type { OutboundMessage } from '../domain/outbound-message.entity';
import type { MessagingProvider, MessagingProviderResult } from '../application/messaging-provider';
import type { MetaWhatsAppHttpClient } from './meta-whatsapp-http-client';
import type { MessagingProviderCredentialResolver } from '../application/messaging-provider-credentials';
import type { ActiveMessagingConnection } from '../domain/messaging-connection.repository';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

export type MetaWhatsAppProviderErrorKind = 'configuration' | 'recipient' | 'authentication' | 'rate_limit' | 'http' | 'timeout' | 'network' | 'invalid_response';

export interface MetaWhatsAppSafeErrorDetails {
  status: number;
  code?: number;
  type?: string;
  message?: string;
  error_subcode?: number;
  details?: string;
}

export class MetaWhatsAppProviderError extends Error {
  constructor(readonly kind: MetaWhatsAppProviderErrorKind, message: string, readonly status?: number, readonly meta?: MetaWhatsAppSafeErrorDetails) {
    super(message);
    this.name = 'MetaWhatsAppProviderError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class MetaWhatsAppProvider implements MessagingProvider {
  private readonly credentials?: MessagingProviderCredentialResolver;
  private readonly timeoutMs: number;

  constructor(
    private readonly configuration: MetaWhatsAppConfiguration,
    private readonly http: MetaWhatsAppHttpClient,
    credentialsOrTimeout?: MessagingProviderCredentialResolver | number,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.credentials = typeof credentialsOrTimeout === 'number' ? undefined : credentialsOrTimeout;
    this.timeoutMs = typeof credentialsOrTimeout === 'number' ? credentialsOrTimeout : timeoutMs;
  }

  supports(provider: MessagingConnectionProvider): boolean {
    return provider === MessagingConnectionProvider.META_WHATSAPP;
  }

  async send(message: OutboundMessage, connection?: ActiveMessagingConnection): Promise<MessagingProviderResult> {
    if (message.channel !== MessagingChannel.WHATSAPP) {
      throw new MetaWhatsAppProviderError('configuration', 'Meta WhatsApp solo admite mensajes del canal WHATSAPP.');
    }
    const text = textFromPayload(message.payload);
    if (!text) throw new MetaWhatsAppProviderError('configuration', 'El mensaje saliente no contiene un texto para enviar.');
    const selected = connection ?? this.legacyConnection();
    if (!selected || selected.provider !== MessagingConnectionProvider.META_WHATSAPP || selected.channel !== MessagingChannel.WHATSAPP) {
      throw new MetaWhatsAppProviderError('configuration', 'La conexión seleccionada no es compatible con Meta WhatsApp.');
    }
    const credentials = this.credentials ? await this.credentials.resolve({ connectionId: selected.connectionId, businessId: selected.businessId, provider: selected.provider }) : { accessToken: this.configuration.accessToken };
    return this.sendTextWithRouting(selected.providerPhoneNumberId, credentials.accessToken, message.recipient, text);
  }

  async sendText(recipient: string, text: string): Promise<MessagingProviderResult> {
    if (!this.configuration.phoneNumberId) throw new MetaWhatsAppProviderError('configuration', 'META_WHATSAPP_PHONE_NUMBER_ID solo está disponible para el smoke manual de una conexión.');
    return this.sendTextWithRouting(this.configuration.phoneNumberId, this.configuration.accessToken, recipient, text);
  }

  private async sendTextWithRouting(phoneNumberId: string, accessToken: string, recipient: string, text: string): Promise<MessagingProviderResult> {
    const normalizedRecipient = normalizeRecipient(recipient);
    if (!text.trim()) throw new MetaWhatsAppProviderError('configuration', 'El texto del mensaje no puede estar vacío.');
    const url = `https://graph.facebook.com/${encodeURIComponent(this.configuration.graphApiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`;
    const requestBody = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedRecipient,
      type: 'text',
      text: { preview_url: false, body: text },
    });

    let response: { status: number; body: unknown };
    try {
      response = await this.http.post(url, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: requestBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: unknown) {
      throw normalizeTransportError(error);
    }

    const meta = metaErrorDetailsFrom(response.status, response.body, accessToken);
    if (response.status === 401 || response.status === 403) {
      throw new MetaWhatsAppProviderError('authentication', `Meta WhatsApp rechazó la autenticación o los permisos (HTTP ${response.status}).`, response.status, meta);
    }
    if (response.status === 429) {
      throw new MetaWhatsAppProviderError('rate_limit', 'Meta WhatsApp rechazó temporalmente la solicitud por límite de tasa (HTTP 429).', response.status, meta);
    }
    if (response.status >= 400 && response.status < 500) {
      throw new MetaWhatsAppProviderError('http', `Meta WhatsApp rechazó la solicitud (HTTP ${response.status}).`, response.status, meta);
    }
    if (response.status >= 500) {
      throw new MetaWhatsAppProviderError('http', `Meta WhatsApp no está disponible temporalmente (HTTP ${response.status}).`, response.status, meta);
    }
    const providerMessageId = providerMessageIdFrom(response.body);
    if (!providerMessageId) throw new MetaWhatsAppProviderError('invalid_response', 'Meta WhatsApp devolvió una respuesta sin identificador de mensaje.', response.status);
    return { providerMessageId };
  }

  private legacyConnection(): ActiveMessagingConnection | null {
    if (!this.configuration.phoneNumberId) return null;
    return { connectionId: 'legacy-meta-smoke', businessId: 'legacy-meta-smoke', channel: MessagingChannel.WHATSAPP, provider: MessagingConnectionProvider.META_WHATSAPP, providerPhoneNumberId: this.configuration.phoneNumberId, status: 'ACTIVE' };
  }
}

function normalizeRecipient(recipient: string): string {
  const value = recipient.trim();
  if (/^\+[1-9]\d{7,14}$/.test(value)) return value.slice(1);
  if (/^[1-9]\d{7,14}$/.test(value)) return value;
  throw new MetaWhatsAppProviderError('recipient', 'El destinatario debe ser un teléfono E.164 válido.');
}

function textFromPayload(payload: OutboundMessage['payload']): string | null {
  const direct = payload.text ?? payload.body;
  if (typeof direct === 'string' && direct.trim()) return direct;
  if (direct && typeof direct === 'object' && !Array.isArray(direct) && typeof direct.body === 'string' && direct.body.trim()) return direct.body;
  return null;
}

function providerMessageIdFrom(body: unknown): string | null {
  const response = record(body);
  const messages = response?.messages;
  if (!Array.isArray(messages)) return null;
  const first = record(messages[0]);
  const id = first?.id;
  return typeof id === 'string' && id.trim() ? id : null;
}

function metaErrorDetailsFrom(status: number, body: unknown, accessToken: string): MetaWhatsAppSafeErrorDetails {
  const details: MetaWhatsAppSafeErrorDetails = { status };
  const error = record(record(body)?.error);
  if (!error) return details;
  const code = numberValue(error.code);
  const errorSubcode = numberValue(error.error_subcode);
  const type = safeText(error.type, accessToken);
  const message = safeText(error.message, accessToken);
  const errorDataDetails = safeText(record(error.error_data)?.details, accessToken);
  if (code !== undefined) details.code = code;
  if (type !== undefined) details.type = type;
  if (message !== undefined) details.message = message;
  if (errorSubcode !== undefined) details.error_subcode = errorSubcode;
  if (errorDataDetails !== undefined) details.details = errorDataDetails;
  return details;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeText(value: unknown, accessToken: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.replaceAll(accessToken, '[REDACTED]').slice(0, 2_000);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeTransportError(error: unknown): MetaWhatsAppProviderError {
  if (isTimeoutError(error)) return new MetaWhatsAppProviderError('timeout', 'La solicitud a Meta WhatsApp agotó el tiempo de espera.');
  return new MetaWhatsAppProviderError('network', 'No se pudo conectar con Meta WhatsApp.');
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === 'TimeoutError' || candidate.name === 'AbortError' || candidate.code === 'ETIMEDOUT';
}
