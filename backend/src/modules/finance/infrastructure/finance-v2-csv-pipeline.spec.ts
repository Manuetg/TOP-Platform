import { BadRequestException,ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { HISTORY_CSV_HEADER } from '../application/finance-v2-import.parser';
import { FinanceCsvPreviewError } from '../application/finance-v2-csv-preview.error';
import type { FinanceV2UseCases } from '../application/finance-v2.use-cases';
import type { FinanceV2ReadRepository } from '../domain/finance-v2.types';
import { FinanceV2Controller } from '../presentation/finance-v2.controller';
import { FinanceV2EvidenceReadService } from './finance-v2-evidence.read-service';
import { FinanceImportBankSqlSnapshotReader } from './finance-v2-import-bank.snapshot-reader';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceV2AlertsReadService } from './finance-v2-alerts.read-service';
import { parseFinanceHistoryPreview,parseFinanceBankStatementPreview } from './finance-composition.validation';

const businessId='11111111-1111-4111-8111-111111111111',actorUserId='22222222-2222-4222-8222-222222222222',accountId='33333333-3333-4333-8333-333333333333';
const request={authenticatedPrincipal:{userId:actorUserId}}as AuthenticatedRequest;
const bankCsv='externalKey,bookedOn,amountMinor,reference\nrow-a,2026-10-01,9007199254740992,private row-a\nrow-b,2026-02-30,100,private row-b';
const row=(kind:string)=>HISTORY_CSV_HEADER.map(column=>column==='rowKind'?kind:column==='rowKey'?'own-row':'').join(',');
const historyCsv=[HISTORY_CSV_HEADER.join(','),row('INVALID_A'),row('INVALID_B')].join('\n');
function fixture(role='OWNER'){
  const queries:string[]=[];
  const tx:FinanceSqlTransaction={query<T extends object>(sql:string):Promise<T[]>{
    queries.push(sql);if(!sql.includes('FROM "User"'))return Promise.reject(new Error('INVALID_CSV_MUST_NOT_QUERY_SNAPSHOT'));
    return Promise.resolve([{status:'ACTIVE',role,currency:'PYG',timeZone:'UTC'}]as unknown as T[]);
  },execute(){return Promise.reject(new Error('PREVIEW_MUST_NOT_WRITE'));}};
  const snapshot=new FinanceImportBankSqlSnapshotReader({load:()=>Promise.reject(new Error('NO_PRIVATE_PAYMENT_READ'))},{read:()=>Promise.reject(new Error('NO_PRIVATE_BOOKING_READ'))});
  const service=new FinanceV2EvidenceReadService({read:work=>work(tx)},snapshot);
  const controller=new FinanceV2Controller(service as unknown as FinanceV2ReadRepository,{}as FinanceV2UseCases,{}as FinanceV2AlertsReadService);
  return{queries,tx,snapshot,controller};
}
describe('Concrete CSV controller → authorization → evidence service → SQL snapshot reader (unit tx; no DB)',()=>{
  it('uses existing bounded shape preview parsers without parsing semantic CSV rows',()=>{
    expect(parseFinanceHistoryPreview({sourceNamespace:'own',csv:historyCsv})).toEqual({sourceNamespace:'own',csv:historyCsv});
    expect(parseFinanceBankStatementPreview({accountId,expectedAccountVersion:1,sourceNamespace:'own',csv:bankCsv})).toEqual({accountId,expectedAccountVersion:1,sourceNamespace:'own',csv:bankCsv});
  });
  it('bank path preserves both real row issues in structured HTTP400 after one Owner authorization query and before snapshot SQL',async()=>{
    const f=fixture(),result=await f.controller.bankPreview(businessId,{accountId,expectedAccountVersion:1,sourceNamespace:'own',csv:bankCsv},request).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(BadRequestException);expect((result as BadRequestException).getResponse()).toEqual({statusCode:400,error:'Bad Request',message:'El CSV contiene errores; revisa las filas indicadas.',previewToken:null,issues:[{ordinal:2,column:'amountMinor',code:'MONEY_OVERFLOW',message:'MONEY_RANGE_INVALID: amountMinor'},{ordinal:3,column:'bookedOn',code:'INVALID_INPUT',message:'DATE_INVALID: bookedOn'}]});
    expect(f.queries).toHaveLength(1);expect(f.queries[0]).toContain('FROM "User"');expect(JSON.stringify((result as BadRequestException).getResponse())).not.toContain('private row');
  });
  it('history path preserves real row2/row3 issues and does not load any account/catalog/Booking/Payment snapshot',async()=>{
    const f=fixture(),result=await f.controller.historyPreview(businessId,{sourceNamespace:'own',csv:historyCsv},request).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(BadRequestException);expect((result as BadRequestException).getResponse()).toEqual({statusCode:400,error:'Bad Request',message:'El CSV contiene errores; revisa las filas indicadas.',previewToken:null,issues:[{ordinal:2,column:'rowKind',code:'INVALID_INPUT',message:'ROW_KIND_INVALID: rowKind'},{ordinal:3,column:'rowKind',code:'INVALID_INPUT',message:'ROW_KIND_INVALID: rowKind'}]});expect(f.queries).toHaveLength(1);
  });
  it('preserves invalid header global ordinal0 rather than discarding issues into a private IMPORT_CSV_INVALID code',async()=>{
    const wrongHeader=HISTORY_CSV_HEADER.map((column,index)=>index===0?'wrongHeader':column).join(','),f=fixture(),result=await f.controller.historyPreview(businessId,{sourceNamespace:'own',csv:wrongHeader},request).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(BadRequestException);const body=(result as BadRequestException).getResponse() as {previewToken:null;issues:{ordinal:number;code:string;message:string}[]};expect(body.previewToken).toBeNull();expect(body.issues[0]).toMatchObject({ordinal:0,code:'INVALID_INPUT'});expect(body.issues[0].message).toContain('CSV_HEADER_INVALID');expect(f.queries).toHaveLength(1);
  });
  it('rejects Viewer before parsing invalid CSV, returning forbidden without any CSV issue payload',async()=>{
    const f=fixture('VIEWER'),result=await f.controller.bankPreview(businessId,{accountId,expectedAccountVersion:1,sourceNamespace:'own',csv:bankCsv},request).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(ForbiddenException);expect((result as ForbiddenException).getResponse()).not.toHaveProperty('issues');expect(f.queries).toHaveLength(1);
  });
  it('both concrete snapshot early-aborts retain issues and execute zero SQL, so invalid confirm inputs still fail closed',async()=>{
    const f=fixture();await expect(f.snapshot.history(f.tx,{businessId,sourceNamespace:'own',csv:historyCsv})).rejects.toBeInstanceOf(FinanceCsvPreviewError);await expect(f.snapshot.statement(f.tx,{businessId,accountId,expectedAccountVersion:1,sourceNamespace:'own',csv:bankCsv})).rejects.toBeInstanceOf(FinanceCsvPreviewError);expect(f.queries).toEqual([]);
  });
});
