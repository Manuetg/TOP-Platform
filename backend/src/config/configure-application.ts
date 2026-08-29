import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthenticationGuard } from '../shared/security/authentication.guard';
import { BusinessAuthorizationGuard } from '../shared/security/business-authorization.guard';

export interface ApplicationConfigurationOptions { security?: boolean }

export function configureApplication(app: INestApplication, options: ApplicationConfigurationOptions = {}): void {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  if (options.security !== false) app.useGlobalGuards(app.get(AuthenticationGuard), app.get(BusinessAuthorizationGuard));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TOP API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}
