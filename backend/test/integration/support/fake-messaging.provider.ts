import type { MessagingProvider, MessagingProviderResult } from '../../../src/modules/messaging/application/messaging-provider';
import type { OutboundMessage } from '../../../src/modules/messaging/domain/outbound-message.entity';
import type { ActiveMessagingConnection } from '../../../src/modules/messaging/domain/messaging-connection.repository';

export class FakeMessagingProvider implements MessagingProvider {
  readonly sent: OutboundMessage[] = [];
  readonly selectedConnections: Array<ActiveMessagingConnection | undefined> = [];
  fail = false;

  send(message: OutboundMessage, connection?: ActiveMessagingConnection): Promise<MessagingProviderResult> {
    if (this.fail) return Promise.reject(new Error('forced messaging provider failure'));
    this.sent.push(message);
    this.selectedConnections.push(connection);
    return Promise.resolve({ providerMessageId: `fake-provider-${message.id}` });
  }
}
