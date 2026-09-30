import { validatePrismaEnvironmentMetadata } from './prisma-environment';

describe('artefacto Prisma de producción sin autoload env', () => {
  it.each(['{"rootEnvPath":null,"schemaEnvPath":null}', '{"rootEnvPath":null}'])('acepta el cliente generado en contexto limpio sin rutas env (%s)', (metadata) => {
    expect(() => validatePrismaEnvironmentMetadata(`const config = {"relativeEnvPaths":${metadata}}`)).not.toThrow();
  });

  it.each([
    '"relativeEnvPaths":{"rootEnvPath":"../../../.env","schemaEnvPath":null}',
    '"relativeEnvPaths":{"rootEnvPath":null,"schemaEnvPath":"../../../.env"}',
    '"relativeEnvPaths":{"rootEnvPath":null,"unknownEnvPath":".env"}',
    '"relativeEnvPaths":{"rootEnvPath":null,"schemaEnvPath":undefined}',
    'unknown-generated-client-shape',
  ])('rechaza autoload o metadatos desconocidos sin imprimir contenido (%s)', (source) => {
    expect(() => validatePrismaEnvironmentMetadata(source)).toThrow('PRISMA_CLIENT');
  });
});
