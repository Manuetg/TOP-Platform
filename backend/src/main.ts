import { Logger } from '@nestjs/common';
import { bootstrap } from './config/bootstrap';
import { EnvironmentConfigurationError } from './config/environment';

void bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(error instanceof EnvironmentConfigurationError ? error.message : 'No se pudo iniciar la aplicación.');
  process.exitCode = 1;
});
