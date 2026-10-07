import 'reflect-metadata';
import type { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { FinanceEvidenceController,FINANCE_EVIDENCE_MULTIPART_OPTIONS } from './finance-evidence.controller';
import { FinanceEvidenceUseCases } from '../application/finance-evidence.use-cases';
import type { FinanceEvidenceRepositoryPort } from '../application/finance-evidence.repository.port';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BUSINESS_ACCESS_KEY } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import { FinancialFileUnavailableError } from '../domain/finance-evidence-file.rules';

const businessId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222',expenseId='33333333-3333-4333-8333-333333333333',fileId='44444444-4444-4444-8444-444444444444';
const request={authenticatedPrincipal:{userId}}as AuthenticatedRequest;
const metadata={id:fileId,businessId,expenseId,expenseVersion:2,filename:'comprobante ñ.pdf',mimeType:'application/pdf' as const,sizeBytes:5,sha256:'a'.repeat(64),recordedByUserId:userId,createdAt:'2026-10-05T12:00:00.000Z'};
function fixture(){
  const repository={list:jest.fn(),upload:jest.fn(),download:jest.fn()}satisfies FinanceEvidenceRepositoryPort;
  return {repository,controller:new FinanceEvidenceController(new FinanceEvidenceUseCases(repository))};
}
describe('Finance evidence authenticated proxy controller',()=>{
  it('binds the separate evidence capabilities on every route',()=>{
    const routeMetadata=(name:string):unknown=>Reflect.getMetadata(BUSINESS_ACCESS_KEY,Reflect.get(FinanceEvidenceController.prototype,name)as object)as unknown;
    expect(routeMetadata('list')).toEqual({parameter:'businessId',capabilities:[Capability.FINANCE_EVIDENCE_READ]});
    expect(routeMetadata('download')).toEqual({parameter:'businessId',capabilities:[Capability.FINANCE_EVIDENCE_READ]});
    expect(routeMetadata('upload')).toEqual({parameter:'businessId',capabilities:[Capability.FINANCE_EVIDENCE_WRITE]});
  });
  it('requires an authenticated principal before invoking repository reads',async()=>{
    const f=fixture();await expect(f.controller.list(businessId,expenseId,{}as AuthenticatedRequest)).rejects.toMatchObject({status:401});expect(f.repository.list).not.toHaveBeenCalled();
  });
  it('returns a bounded attachment with encoded filename and server MIME/length',async()=>{
    const f=fixture();f.repository.download.mockResolvedValue({metadata,bytes:Buffer.from('proof')});
    const setHeader=jest.fn();const stream=await f.controller.download(businessId,fileId,request,{setHeader}as unknown as Response);
    expect(stream).toBeInstanceOf(StreamableFile);expect(f.repository.download).toHaveBeenCalledWith({businessId,actorUserId:userId},fileId);
    expect(setHeader).toHaveBeenCalledWith('Content-Type','application/pdf');expect(setHeader).toHaveBeenCalledWith('Content-Length',5);
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition',"attachment; filename=\"evidence\"; filename*=UTF-8''comprobante%20%C3%B1.pdf");
  });
  it('reports unavailable private storage without exposing implementation data',async()=>{
    const f=fixture();f.repository.download.mockRejectedValue(new FinancialFileUnavailableError('El almacenamiento privado no está disponible.'));
    await expect(f.controller.download(businessId,fileId,request,{setHeader:jest.fn()}as unknown as Response)).rejects.toMatchObject({status:503,response:{code:'FINANCIAL_FILE_UNAVAILABLE'}});
  });
  it('preserves unexpected infrastructure failures as server errors',async()=>{
    const f=fixture(),failure=new Error('DATABASE_UNEXPECTED');f.repository.download.mockRejectedValue(failure);
    await expect(f.controller.download(businessId,fileId,request,{setHeader:jest.fn()}as unknown as Response)).rejects.toBe(failure);
  });
  it('rejects a missing multipart file rather than calling the repository',async()=>{
    const f=fixture();await expect(f.controller.upload(businessId,expenseId,{expectedVersion:'1'},'upload-file-command-0001',undefined,request)).rejects.toMatchObject({status:400});expect(f.repository.upload).not.toHaveBeenCalled();
  });
  it('declares an effective Multer boundary before buffers (actual middleware checked by the HTTP suite)',()=>{
    expect(FINANCE_EVIDENCE_MULTIPART_OPTIONS.limits).toEqual({fileSize:2097152,files:1,fields:1,fieldSize:32});
    expect(FINANCE_EVIDENCE_MULTIPART_OPTIONS.defParamCharset).toBe('utf8');
  });
});
