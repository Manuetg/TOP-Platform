import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from './authenticated-principal';

export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().authenticatedPrincipal;
    if (!principal) throw new UnauthorizedException('Se requiere autenticación.');
    return principal;
  },
);
