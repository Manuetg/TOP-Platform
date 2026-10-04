import { FetchMetaWhatsAppHttpClient } from './meta-whatsapp-http-client';

describe('FetchMetaWhatsAppHttpClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('convierte una respuesta sin JSON en body null sin lanzar', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 400,
      json: jest.fn().mockRejectedValue(new SyntaxError('invalid json')),
    } as unknown as Response);

    await expect(new FetchMetaWhatsAppHttpClient().post('https://graph.facebook.com/test', {
      headers: { Authorization: 'Bearer token-never-logged' }, body: '{}', signal: AbortSignal.timeout(1_000),
    })).resolves.toEqual({ status: 400, body: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
