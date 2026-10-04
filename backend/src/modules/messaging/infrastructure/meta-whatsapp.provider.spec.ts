import { MessagingChannel } from '../domain/messaging-channel.enum';
import { OutboundMessage } from '../domain/outbound-message.entity';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';
import { MetaWhatsAppProvider, MetaWhatsAppProviderError } from './meta-whatsapp.provider';
import type { MetaWhatsAppHttpClient, MetaWhatsAppHttpRequest, MetaWhatsAppHttpResponse } from './meta-whatsapp-http-client';

class FakeMetaWhatsAppHttpClient implements MetaWhatsAppHttpClient {
  readonly requests: Array<{ url: string; request: MetaWhatsAppHttpRequest }> = [];
  response: MetaWhatsAppHttpResponse = { status: 200, body: { messages: [{ id: 'wamid.synthetic' }] } };
  error: Error | null = null;

  post(url: string, request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse> {
    this.requests.push({ url, request });
    if (this.error) throw this.error;
    return Promise.resolve(this.response);
  }
}

const configuration = { accessToken: 'token-never-logged', phoneNumberId: '123456789012345', graphApiVersion: 'v26.0' };

function message(payload: Record<string, string>): OutboundMessage {
  return OutboundMessage.create({
    id: 'outbound-message-id', businessId: 'business-id', integrationEventId: 'integration-event-id', channel: MessagingChannel.WHATSAPP,
    recipient: '+595981234567', messageType: OutboundMessageType.BOOKING_CONFIRMATION, status: OutboundMessageStatus.PENDING,
    payload, providerMessageId: null, createdAt: new Date('2026-10-03T12:00:00.000Z'), sentAt: null, failedAt: null, lastError: null,
  });
}

describe('MetaWhatsAppProvider', () => {
  it('envía texto y devuelve el providerMessageId de Meta', async () => {
    const http = new FakeMetaWhatsAppHttpClient();
    const provider = new MetaWhatsAppProvider(configuration, http, 1_000);

    await expect(provider.send(message({ text: 'Hola desde TOP' }))).resolves.toEqual({ providerMessageId: 'wamid.synthetic' });

    expect(http.requests[0].url).toBe('https://graph.facebook.com/v26.0/123456789012345/messages');
    expect(http.requests[0].request.headers).toEqual({ Authorization: 'Bearer token-never-logged', 'Content-Type': 'application/json' });
    expect(JSON.parse(http.requests[0].request.body)).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '595981234567', type: 'text', text: { preview_url: false, body: 'Hola desde TOP' } });
    expect(http.requests[0].request.signal).toBeInstanceOf(AbortSignal);
  });

  it('acepta payload.body como forma textual provider-neutral', async () => {
    const http = new FakeMetaWhatsAppHttpClient();
    await expect(new MetaWhatsAppProvider(configuration, http).send(message({ body: 'Texto' }))).resolves.toEqual({ providerMessageId: 'wamid.synthetic' });
    expect((JSON.parse(http.requests[0].request.body) as { text: { body: string } }).text.body).toBe('Texto');
  });

  it.each([
    [400, 'http'], [401, 'authentication'], [403, 'authentication'], [429, 'rate_limit'], [500, 'http'],
  ] as const)('normaliza HTTP %s sin exponer la respuesta de Meta', async (status, kind) => {
    const http = new FakeMetaWhatsAppHttpClient();
    http.response = { status, body: { error: { message: 'secret-meta-error-detail' } } };
    const provider = new MetaWhatsAppProvider(configuration, http);

    const result = provider.send(message({ text: 'Texto' }));
    await expect(result).rejects.toMatchObject({ kind, status });
    await expect(result).rejects.toThrow(status.toString());
    await expect(result).rejects.not.toThrow('secret-meta-error-detail');
  });

  it('conserva los campos seguros del error Meta y redacta el token', async () => {
    const http = new FakeMetaWhatsAppHttpClient();
    http.response = {
      status: 400,
      body: {
        error: {
          code: 131026,
          type: 'OAuthException',
          message: 'Invalid token-never-logged',
          error_subcode: 2494102,
          error_data: { details: 'Recipient rejected token-never-logged' },
          fbtrace_id: 'must-not-be-exposed',
        },
      },
    };

    await expect(new MetaWhatsAppProvider(configuration, http).send(message({ text: 'Texto' }))).rejects.toMatchObject({
      status: 400,
      meta: {
        status: 400,
        code: 131026,
        type: 'OAuthException',
        message: 'Invalid [REDACTED]',
        error_subcode: 2494102,
        details: 'Recipient rejected [REDACTED]',
      },
    });
    await expect(new MetaWhatsAppProvider(configuration, http).send(message({ text: 'Texto' }))).rejects.not.toThrow('must-not-be-exposed');
  });

  it('conserva detalles seguros en 401 y 429', async () => {
    for (const status of [401, 429]) {
      const http = new FakeMetaWhatsAppHttpClient();
      http.response = { status, body: { error: { code: status, type: 'OAuthException', message: `Meta error ${status}`, error_data: { details: 'safe details' } } } };
      await expect(new MetaWhatsAppProvider(configuration, http).send(message({ text: 'Texto' }))).rejects.toMatchObject({ status, meta: { status, code: status, type: 'OAuthException', message: `Meta error ${status}`, details: 'safe details' } });
    }
  });

  it('mantiene solo el HTTP status cuando la respuesta no contiene JSON válido', async () => {
    const http = new FakeMetaWhatsAppHttpClient();
    http.response = { status: 400, body: null };
    await expect(new MetaWhatsAppProvider(configuration, http).send(message({ text: 'Texto' }))).rejects.toMatchObject({ status: 400, meta: { status: 400 } });
  });

  it('normaliza timeout y falla de red sin propagar detalles sensibles', async () => {
    const timeoutHttp = new FakeMetaWhatsAppHttpClient();
    timeoutHttp.error = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    await expect(new MetaWhatsAppProvider(configuration, timeoutHttp).send(message({ text: 'Texto' }))).rejects.toMatchObject<Partial<MetaWhatsAppProviderError>>({ kind: 'timeout' });

    const networkHttp = new FakeMetaWhatsAppHttpClient();
    networkHttp.error = new Error('ECONNRESET token-never-logged');
    await expect(new MetaWhatsAppProvider(configuration, networkHttp).send(message({ text: 'Texto' }))).rejects.toMatchObject<Partial<MetaWhatsAppProviderError>>({ kind: 'network' });
    await expect(new MetaWhatsAppProvider(configuration, networkHttp).send(message({ text: 'Texto' }))).rejects.not.toThrow('token-never-logged');
  });

  it('rechaza una respuesta exitosa sin message id', async () => {
    const http = new FakeMetaWhatsAppHttpClient();
    http.response = { status: 200, body: { messages: [] } };
    await expect(new MetaWhatsAppProvider(configuration, http).send(message({ text: 'Texto' }))).rejects.toMatchObject<Partial<MetaWhatsAppProviderError>>({ kind: 'invalid_response' });
  });

  it.each(['+5959812', 'invalid', '+000000000000000'])('rechaza destinatario no E.164 (%s) antes de llamar a Meta', async (recipient) => {
    const http = new FakeMetaWhatsAppHttpClient();
    await expect(new MetaWhatsAppProvider(configuration, http).sendText(recipient, 'Texto')).rejects.toMatchObject<Partial<MetaWhatsAppProviderError>>({ kind: 'recipient' });
    expect(http.requests).toHaveLength(0);
  });

  it('no permite enviar un mensaje sin texto', async () => {
    const http = new FakeMetaWhatsAppHttpClient();
    await expect(new MetaWhatsAppProvider(configuration, http).send(message({ bookingId: 'booking-id' }))).rejects.toMatchObject<Partial<MetaWhatsAppProviderError>>({ kind: 'configuration' });
  });
});
