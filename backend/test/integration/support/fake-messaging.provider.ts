import type { MessagingProvider, MessagingProviderResult } from '../../../src/modules/messaging/application/messaging-provider';
import type { OutboundMessage } from '../../../src/modules/messaging/domain/outbound-message.entity';

export class FakeMessagingProvider implements MessagingProvider {
  readonly sent: OutboundMessage[] = [];
  fail = false;

  send(message: OutboundMessage): Promise<MessagingProviderResult> {
    if (this.fail) return Promise.reject(new Error('forced messaging provider failure'));
    this.sent.push(message);
    return Promise.resolve({ providerMessageId: `fake-provider-${message.id}` });
  }
}
