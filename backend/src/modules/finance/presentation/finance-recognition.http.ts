import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { FinanceConflictError, FinanceForbiddenError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import type { FinanceActor } from '../domain/finance.types';
import { FinanceRecognitionError } from '../domain/finance-recognition.support';
import { parseFinanceRecognitionUuid } from '../application/finance-recognition.validation';

export function financeRecognitionActor(businessId: unknown, request: AuthenticatedRequest): FinanceActor {
  if (!request.authenticatedPrincipal) throw new UnauthorizedException();
  return { businessId: parseFinanceRecognitionUuid(businessId), actorUserId: request.authenticatedPrincipal.userId };
}

function recognitionException(error: FinanceRecognitionError): Error {
  const response = { code: error.code, message: error.message };
  if (error.code === 'FINANCE_FORBIDDEN') return new ForbiddenException(response);
  if (error.code === 'SOURCE_NOT_FOUND') return new NotFoundException(response);
  if (error.code.endsWith('_CONFLICT') || ['FINANCE_PERIOD_CLOSED', 'CLOSE_WRITERS_UNGUARDED', 'SOURCE_LIMIT'].includes(error.code)) return new ConflictException(response);
  return new BadRequestException(response);
}

export async function financeRecognitionResponse<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error: unknown) {
    if (error instanceof FinanceRecognitionError) throw recognitionException(error);
    if (error instanceof FinanceInputError) throw new BadRequestException(error.message);
    if (error instanceof FinanceConflictError) throw new ConflictException(error.message);
    if (error instanceof FinanceNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof FinanceForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof Error && 'code' in error && error.code === 'SOURCE_LIMIT') throw new ConflictException({ code: 'SOURCE_LIMIT', message: error.message });
    throw error;
  }
}
