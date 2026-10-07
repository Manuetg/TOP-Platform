import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, NotFoundException, Param, Post, Req, Res, ServiceUnavailableException, StreamableFile, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Response } from 'express';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { FinanceEvidenceUseCases } from '../application/finance-evidence.use-cases';
import type { FinanceEvidenceActor, FinanceEvidenceListDto, FinanceEvidenceUploadResult } from '../domain/finance-evidence.types';
import { FinancialFileInputError, FinancialFileIntegrityError, FinancialFileUnavailableError, FINANCE_EVIDENCE_MIME_TYPES, MAX_FINANCE_EVIDENCE_BYTES } from '../domain/finance-evidence-file.rules';
import { FinanceConflictError, FinanceForbiddenError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';

interface FinanceEvidenceMultipartFile { originalname: string; mimetype: string; buffer: Buffer }
export const FINANCE_EVIDENCE_MULTIPART_OPTIONS: MulterOptions = {
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_FINANCE_EVIDENCE_BYTES, files: 1, fields: 1, fieldSize: 32 },
  fileFilter(_request, file, callback) {
    if (!FINANCE_EVIDENCE_MIME_TYPES.includes(file.mimetype as typeof FINANCE_EVIDENCE_MIME_TYPES[number])) {
      callback(new BadRequestException('Formato de archivo no admitido.'), false);
      return;
    }
    callback(null, true);
  },
};

function actor(businessId: string, request: AuthenticatedRequest): FinanceEvidenceActor {
  if (!request.authenticatedPrincipal) throw new UnauthorizedException();
  return { businessId, actorUserId: request.authenticatedPrincipal.userId };
}

async function response<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { throw mapEvidenceHttpError(error); }
}

function mapEvidenceHttpError(error: unknown): unknown {
  if (error instanceof FinanceInputError || error instanceof FinancialFileInputError) return new BadRequestException(error.message);
  if (error instanceof FinanceConflictError) return new ConflictException(error.message);
  if (error instanceof FinanceForbiddenError) return new ForbiddenException(error.message);
  if (error instanceof FinanceNotFoundError) return new NotFoundException(error.message);
  if (error instanceof FinancialFileUnavailableError || error instanceof FinancialFileIntegrityError) return new ServiceUnavailableException({ code: error.code, message: error.message });
  return error;
}

function attachment(filename: string): string {
  return `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

@Controller('businesses/:businessId/finance')
export class FinanceEvidenceController {
  constructor(private readonly files: FinanceEvidenceUseCases) {}

  @Get('expenses/:expenseId/evidence')
  @Header('Cache-Control', 'private, no-store')
  @BusinessAccess('businessId', Capability.FINANCE_EVIDENCE_READ)
  list(@Param('businessId') businessId: string, @Param('expenseId') expenseId: string, @Req() request: AuthenticatedRequest): Promise<FinanceEvidenceListDto> {
    return response(() => this.files.list(actor(businessId, request), expenseId));
  }

  @Post('expenses/:expenseId/evidence')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @BusinessAccess('businessId', Capability.FINANCE_EVIDENCE_WRITE)
  @UseInterceptors(FileInterceptor('file', FINANCE_EVIDENCE_MULTIPART_OPTIONS))
  upload(@Param('businessId') businessId: string, @Param('expenseId') expenseId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @UploadedFile() file: FinanceEvidenceMultipartFile | undefined, @Req() request: AuthenticatedRequest): Promise<FinanceEvidenceUploadResult> {
    return response(() => this.files.upload(actor(businessId, request), expenseId, body, key, { filename: file?.originalname, mimeType: file?.mimetype, bytes: file?.buffer }));
  }

  @Get('evidence/:fileId/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @BusinessAccess('businessId', Capability.FINANCE_EVIDENCE_READ)
  async download(@Param('businessId') businessId: string, @Param('fileId') fileId: string, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) headers: Response): Promise<StreamableFile> {
    const file = await response(() => this.files.download(actor(businessId, request), fileId));
    headers.setHeader('Content-Type', file.metadata.mimeType);
    headers.setHeader('Content-Length', file.bytes.length);
    headers.setHeader('Content-Disposition', attachment(file.metadata.filename));
    return new StreamableFile(file.bytes);
  }
}
