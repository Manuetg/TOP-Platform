import { readFileSync } from 'node:fs';
import { EnvironmentConfigurationError } from './environment';

export function validatePrismaEnvironmentMetadata(source: string): void {
  const match = /"relativeEnvPaths"\s*:\s*(\{[^}]*\})/.exec(source);
  let metadata: unknown;
  try { metadata = match ? JSON.parse(match[1]) as unknown : undefined; }
  catch { metadata = undefined; }
  if (!isCleanEnvironmentMetadata(metadata)) {
    throw new EnvironmentConfigurationError('PRISMA_CLIENT', 'producción requiere un cliente generado sin carga automática de .env; construir la imagen en el contexto limpio del Dockerfile.');
  }
}

function isCleanEnvironmentMetadata(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null || !('rootEnvPath' in metadata) || metadata.rootEnvPath !== null) return false;
  if ('schemaEnvPath' in metadata && metadata.schemaEnvPath !== null) return false;
  return Object.keys(metadata).every((key) => ['rootEnvPath', 'schemaEnvPath'].includes(key));
}

export function validateProductionPrismaArtifact(): void {
  // Leer metadatos sin importar el cliente, que puede ejecutar dotenv al importar.
  validatePrismaEnvironmentMetadata(readFileSync(require.resolve('.prisma/client/index'), 'utf8'));
}
