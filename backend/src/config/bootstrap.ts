import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { configureApplication } from './configure-application';
import { configurationFrom, runtimeNodeEnvironment, validateRuntimeBeforeImports } from './environment';
import { validateProductionPrismaArtifact } from './prisma-environment';

async function createApplication(): Promise<INestApplication> {
  validateRuntimeBeforeImports();
  if (runtimeNodeEnvironment() === 'production') validateProductionPrismaArtifact();
  const { AppModule } = await import('../app.module');
  return NestFactory.create(AppModule, { abortOnError: false });
}

export async function bootstrap(factory: () => Promise<INestApplication> = createApplication): Promise<INestApplication> {
  const app = await factory();
  try {
    const configuration = configurationFrom(app.get(ConfigService));
    configureApplication(app, { configuration });
    await app.listen(configuration.PORT);
    return app;
  } catch (error: unknown) {
    await app.close();
    throw error;
  }
}
