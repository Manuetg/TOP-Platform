import { readMetaWhatsAppConfiguration } from '../src/config/environment';
import { MetaWhatsAppProvider, MetaWhatsAppProviderError } from '../src/modules/messaging/infrastructure/meta-whatsapp.provider';
import { FetchMetaWhatsAppHttpClient } from '../src/modules/messaging/infrastructure/meta-whatsapp-http-client';

async function main(): Promise<void> {
  const recipient = process.argv[2];
  const text = process.argv.slice(3).join(' ');
  if (!recipient || !text) throw new Error('Uso: npm run messaging:meta-smoke -- +595XXXXXXXXX "Texto de prueba"');
  const config = readMetaWhatsAppConfiguration({ get: (key: string) => process.env[key] });
  const provider = new MetaWhatsAppProvider(config, new FetchMetaWhatsAppHttpClient());
  const result = await provider.sendText(recipient, text);
  process.stdout.write(`${result.providerMessageId}\n`);
}

main().catch((error: unknown) => {
  if (error instanceof MetaWhatsAppProviderError) {
    process.stderr.write(`${JSON.stringify({ error: error.message, meta: error.meta })}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${error instanceof Error ? error.message : 'No se pudo enviar el mensaje de prueba.'}\n`);
  process.exitCode = 1;
});
