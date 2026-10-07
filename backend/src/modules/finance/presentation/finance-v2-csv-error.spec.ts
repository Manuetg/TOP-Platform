import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import type { FinanceV2ReadRepository } from '../domain/finance-v2.types';
import { FinanceInputError } from '../domain/finance.errors';
import { FinanceCsvPreviewError } from '../application/finance-v2-csv-preview.error';
import type { FinanceV2UseCases } from '../application/finance-v2.use-cases';
import type { FinanceV2AlertsReadService } from '../infrastructure/finance-v2-alerts.read-service';
import { FinanceV2Controller } from './finance-v2.controller';

const businessId='11111111-1111-4111-8111-111111111111';
const request={authenticatedPrincipal:{userId:'22222222-2222-4222-8222-222222222222'}}as AuthenticatedRequest;
function controller(error:Error):FinanceV2Controller{
  const readers={importPreview:()=>Promise.reject(error)}as unknown as FinanceV2ReadRepository;
  return new FinanceV2Controller(readers,{}as FinanceV2UseCases,{}as FinanceV2AlertsReadService);
}
describe('CSV HTTP exception envelope (controller unit; no network)',()=>{
  it('maps only the CSV error to HTTP400 with existing issues and previewToken null',async()=>{
    const result=await controller(new FinanceCsvPreviewError([{ordinal:3,column:'amountMinor',code:'MONEY_RANGE_INVALID'}])).historyPreview(businessId,{sourceNamespace:'qa',csv:'invalid'},request).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(BadRequestException);const exception=result as BadRequestException;
    expect(exception.getStatus()).toBe(400);expect(exception.getResponse()).toEqual({statusCode:400,error:'Bad Request',message:'El CSV contiene errores; revisa las filas indicadas.',previewToken:null,issues:[{ordinal:3,column:'amountMinor',code:'MONEY_OVERFLOW',message:'MONEY_RANGE_INVALID: amountMinor'}]});
  });
  it('keeps ordinary input errors in the existing HTTP400 format',async()=>{
    const result=await controller(new FinanceInputError('Invalid own input')).historyPreview(businessId,{sourceNamespace:'qa',csv:'invalid'},request).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(BadRequestException);expect((result as BadRequestException).getResponse()).toEqual({statusCode:400,error:'Bad Request',message:'Invalid own input'});
  });
});
