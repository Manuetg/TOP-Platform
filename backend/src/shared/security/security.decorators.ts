import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Capability } from '../application/authorization-policy';

export const PUBLIC_ROUTE_KEY = 'top:public-route';
export const BUSINESS_ACCESS_KEY = 'top:business-access';
export const PLATFORM_AUTHORITY_REQUIRED_KEY = 'top:platform-authority-required';

export interface BodyCapabilitySelector {
  field: string;
  capabilities: Readonly<Record<string, Capability>>;
}

export interface BusinessAccessRequirement {
  parameter: string;
  capabilities: readonly Capability[];
  bodySelector?: BodyCapabilitySelector;
}

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE_KEY, true);

export const Authenticated = (): MethodDecorator & ClassDecorator => applyDecorators(
  ApiBearerAuth('access-token'),
  ApiUnauthorizedResponse({ description: 'Access token ausente, inválido o expirado.' }),
);

export const BusinessAccess = (parameter: string, ...capabilities: Capability[]): MethodDecorator & ClassDecorator => applyDecorators(
  SetMetadata(BUSINESS_ACCESS_KEY, { parameter, capabilities } satisfies BusinessAccessRequirement),
  Authenticated(),
  ApiForbiddenResponse({ description: 'El usuario no tiene membresía o rol autorizado en el Business.' }),
);

export const BusinessAccessByBody = (
  parameter: string,
  capability: Capability,
  field: string,
  capabilities: Readonly<Record<string, Capability>>,
): MethodDecorator & ClassDecorator => applyDecorators(
  SetMetadata(BUSINESS_ACCESS_KEY, { parameter, capabilities: [capability], bodySelector: { field, capabilities } } satisfies BusinessAccessRequirement),
  Authenticated(),
  ApiForbiddenResponse({ description: 'El usuario no tiene membresía o capabilities autorizadas en el Business.' }),
);

export const PlatformAuthorityRequired = (): MethodDecorator & ClassDecorator => applyDecorators(
  SetMetadata(PLATFORM_AUTHORITY_REQUIRED_KEY, true),
  Authenticated(),
  ApiForbiddenResponse({ description: 'Esta operación requiere una autoridad de plataforma no disponible en el MVP.' }),
);
