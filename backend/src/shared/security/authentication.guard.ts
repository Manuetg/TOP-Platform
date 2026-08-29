import { CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_TOKEN_VERIFIER, type AccessTokenVerifier } from '../../modules/identity/domain/access-token-issuer';
import { USER_BY_ID_LOOKUP, type UserByIdLookup } from '../../modules/identity/domain/user-by-id.lookup';
import { UserStatus } from '../../modules/identity/domain/user-status.enum';
import type { AuthenticatedRequest } from './authenticated-principal';
import { PUBLIC_ROUTE_KEY } from './security.decorators';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly tokens: AccessTokenVerifier,
    @Inject(USER_BY_ID_LOOKUP) private readonly users: UserByIdLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readBearer(request.headers.authorization);
    try {
      const payload = await this.tokens.verify(token);
      const user = await this.users.findById(payload.sub);
      if (!user || user.status !== UserStatus.ACTIVE) throw new Error('User inválido');
      request.authenticatedPrincipal = { userId: user.id };
      return true;
    } catch {
      throw new UnauthorizedException('El access token no es válido.');
    }
  }

  private readBearer(header: string | undefined): string {
    if (typeof header !== 'string') throw new UnauthorizedException('Se requiere un access token Bearer.');
    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) throw new UnauthorizedException('Se requiere un access token Bearer válido.');
    return match[1];
  }
}
