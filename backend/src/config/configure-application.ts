import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { configurationFrom, type EnvironmentConfiguration } from './environment';
import { AuthenticationGuard } from '../shared/security/authentication.guard';
import { BusinessAuthorizationGuard } from '../shared/security/business-authorization.guard';

export interface ApplicationConfigurationOptions { security?: boolean; configuration?: EnvironmentConfiguration }

export function configureApplication(app: INestApplication, options: ApplicationConfigurationOptions = {}): void {
  const configuration = options.configuration ?? configurationFrom(app.get(ConfigService));
  app.setGlobalPrefix('api', { exclude: [{ path: 'webhooks/meta/whatsapp', method: RequestMethod.ALL }] });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) => callback(null, origin !== undefined && configuration.CORS_ORIGINS.includes(origin)),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  if (options.security !== false) app.useGlobalGuards(app.get(AuthenticationGuard), app.get(BusinessAuthorizationGuard));

  if (configuration.NODE_ENV === 'production') return;
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TOP API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}
