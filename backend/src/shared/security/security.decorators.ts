import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

export const PUBLIC_ROUTE_KEY = 'top:public-route';
export const BUSINESS_ACCESS_KEY = 'top:business-access';
export const ANY_BUSINESS_ROLES_KEY = 'top:any-business-roles';

export interface BusinessAccessRequirement {
  parameter: string;
  roles: readonly string[];
}

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE_KEY, true);

export const Authenticated = (): MethodDecorator & ClassDecorator => applyDecorators(
  ApiBearerAuth('access-token'),
  ApiUnauthorizedResponse({ description: 'Access token ausente, inválido o expirado.' }),
);

export const BusinessAccess = (parameter = 'businessId', ...roles: string[]): MethodDecorator & ClassDecorator => applyDecorators(
  SetMetadata(BUSINESS_ACCESS_KEY, { parameter, roles } satisfies BusinessAccessRequirement),
  Authenticated(),
  ApiForbiddenResponse({ description: 'El usuario no tiene membresía o rol autorizado en el Business.' }),
);

export const AnyBusinessRole = (...roles: string[]): MethodDecorator & ClassDecorator => applyDecorators(
  SetMetadata(ANY_BUSINESS_ROLES_KEY, roles),
  Authenticated(),
  ApiForbiddenResponse({ description: 'El usuario no posee un rol administrativo autorizado.' }),
);
