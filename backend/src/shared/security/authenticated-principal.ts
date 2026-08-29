import type { Request } from 'express';

export interface AuthenticatedPrincipal {
  userId: string;
}

export interface AuthenticatedRequest extends Request {
  authenticatedPrincipal?: AuthenticatedPrincipal;
}
