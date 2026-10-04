import type { ReceiveInboundMessageInput, ReceiveInboundMessageResult } from '../../../src/modules/messaging/application/receive-inbound-message.contract';
import { ReceiveInboundMessageUseCase } from '../../../src/modules/messaging/application/receive-inbound-message.use-case';

export class FakeInboundAdapter {
  constructor(private readonly receiver: ReceiveInboundMessageUseCase) {}

  receive(input: ReceiveInboundMessageInput): Promise<ReceiveInboundMessageResult> {
    return this.receiver.execute(input);
  }
}
