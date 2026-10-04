import { BadRequestException, Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Inject, Post, Query, Req } from '@nestjs/common';
import { Public } from '../../../shared/security/security.decorators';
import type { MessagingWebhookHandler } from '../application/messaging-webhook.contract';
import { ProcessMessagingWebhookUseCase } from '../application/process-messaging-webhook.use-case';
import { MetaWhatsAppWebhookParser } from '../infrastructure/meta-whatsapp-webhook.parser';
import { MetaWhatsAppWebhookSecurity, MetaWhatsAppWebhookSecurityError } from '../infrastructure/meta-whatsapp-webhook.signature';

interface RawBodyRequest {
  body?: unknown;
  rawBody?: Buffer;
}

@Controller('webhooks/meta/whatsapp')
export class MetaWhatsAppWebhookController {
  constructor(
    private readonly security: MetaWhatsAppWebhookSecurity,
    private readonly parser: MetaWhatsAppWebhookParser,
    @Inject(ProcessMessagingWebhookUseCase) private readonly handler: MessagingWebhookHandler,
  ) {}

  @Public()
  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') verifyToken: string, @Query('hub.challenge') challenge: string): string {
    try {
      return this.security.verifyChallenge({ mode, verifyToken, challenge });
    } catch (error: unknown) {
      if (error instanceof MetaWhatsAppWebhookSecurityError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Headers('x-hub-signature-256') signature: string | undefined, @Req() request: RawBodyRequest): Promise<{ received: true }> {
    try {
      this.security.verifySignature(request.rawBody, signature);
    } catch (error: unknown) {
      if (error instanceof MetaWhatsAppWebhookSecurityError) throw new ForbiddenException(error.message);
      throw error;
    }
    if (request.rawBody === undefined) throw new BadRequestException('El cuerpo original del webhook no está disponible.');
    await this.handler.execute(this.parser.parse(request.body));
    return { received: true };
  }
}
