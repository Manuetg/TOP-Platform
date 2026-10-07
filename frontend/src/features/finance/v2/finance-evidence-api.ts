import {apiRequest,ApiResponseError} from '../../../shared/api/api-client';
import type {FinanceContext} from '../api/finance-api';
import {FINANCE_EVIDENCE_MAX_BYTES,type FinanceEvidenceMetadataDto,type FinanceExpenseEvidenceDto,type FinanceEvidenceUploadResult,type FinanceEvidenceMimeType} from './finance-evidence.types';
import {validV2Id,validV2Version} from './finance-v2-api';
export interface EvidenceFileIntent {expenseId:string;expectedVersion:number;filename:string;mimeType:FinanceEvidenceMimeType;sizeBytes:number;sha256:string;bytesBase64:string}
const base=(context:FinanceContext)=>`/businesses/${encodeURIComponent(context.businessId)}/finance`;
const mimeTypes:readonly string[]=['application/pdf','image/jpeg','image/png'];
function validMetadata(file:FinanceEvidenceMetadataDto,context:FinanceContext,expenseId:string) {
  return file&&validV2Id(file.id)&&file.businessId===context.businessId&&file.expenseId===expenseId&&validV2Version(file.expenseVersion)&&typeof file.filename==='string'&&Boolean(file.filename)&&mimeTypes.includes(file.mimeType)&&Number.isSafeInteger(file.sizeBytes)&&file.sizeBytes>0&&file.sizeBytes<=FINANCE_EVIDENCE_MAX_BYTES&&/^[0-9a-f]{64}$/i.test(file.sha256)&&typeof file.recordedByUserId==='string'&&typeof file.createdAt==='string';
}
export async function getFinanceEvidence(context:FinanceContext,expenseId:string,signal?:AbortSignal) {
  const result=await apiRequest<FinanceExpenseEvidenceDto>(`${base(context)}/expenses/${encodeURIComponent(expenseId)}/evidence`,{accessToken:context.accessToken,signal});
  if(!result||typeof result.enabled!=='boolean'||result.retention!=='PRESERVE_WITHOUT_PURGE'||result.fileSizeLimitBytes!==FINANCE_EVIDENCE_MAX_BYTES||!Array.isArray(result.allowedMimeTypes)||result.allowedMimeTypes.some((mime)=>!mimeTypes.includes(mime))||!Array.isArray(result.files)||result.files.some((file)=>!validMetadata(file,context,expenseId)))throw new ApiResponseError();
  return result;
}
export async function prepareEvidenceFile(file:File,expenseId:string,expectedVersion:number):Promise<EvidenceFileIntent> {
  if(!mimeTypes.includes(file.type))throw new Error('Selecciona un archivo PDF, JPEG o PNG con tipo MIME válido.');
  if(file.size<=0||file.size>FINANCE_EVIDENCE_MAX_BYTES)throw new Error('El archivo debe contener datos y pesar como máximo 2 MiB.');
  if(!validV2Version(expectedVersion))throw new Error('Consulta primero la versión vigente del gasto.');
  const buffer=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>reader.result instanceof ArrayBuffer?resolve(reader.result):reject(new Error('No pudimos leer el archivo.'));reader.onerror=()=>reject(new Error('No pudimos leer el archivo.'));reader.readAsArrayBuffer(file);});
  const bytes=new Uint8Array(buffer);let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
  if(!crypto.subtle)throw new Error('No pudimos verificar el contenido del archivo en este navegador.');
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  const sha256=Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,'0')).join('');
  return {expenseId,expectedVersion,filename:file.name,mimeType:file.type as FinanceEvidenceMimeType,sizeBytes:file.size,sha256,bytesBase64:btoa(binary)};
}
export async function uploadFinanceEvidence(context:FinanceContext,command:EvidenceFileIntent,key:string) {
  const bytes=Uint8Array.from(atob(command.bytesBase64),(character)=>character.charCodeAt(0));
  if(bytes.length!==command.sizeBytes||!bytes.length||bytes.length>FINANCE_EVIDENCE_MAX_BYTES)throw new Error('El contenido original del archivo no es válido.');
  const form=new FormData();form.append('file',new Blob([bytes.buffer],{type:command.mimeType}),command.filename);form.append('expectedVersion',String(command.expectedVersion));
  const result=await apiRequest<FinanceEvidenceUploadResult>(`${base(context)}/expenses/${encodeURIComponent(command.expenseId)}/evidence`,{method:'POST',accessToken:context.accessToken,skipUnauthorizedRecovery:true,headers:{'Idempotency-Key':key},body:form});
  if(!result||result.type!=='UPLOAD_FINANCE_EVIDENCE'||!validV2Id(result.id)||!validV2Version(result.version)||result.version!==command.expectedVersion+1||!validMetadata(result.file,context,command.expenseId)||result.id!==result.file.id||result.version!==result.file.expenseVersion||result.file.filename!==command.filename||result.file.sha256!==command.sha256||result.file.mimeType!==command.mimeType||result.file.sizeBytes!==command.sizeBytes)throw new ApiResponseError();
  return result;
}
export async function downloadFinanceEvidence(context:FinanceContext,file:FinanceEvidenceMetadataDto,signal?:AbortSignal) {
  if(file.businessId!==context.businessId||!validMetadata(file,context,file.expenseId))throw new ApiResponseError();
  const blob=await apiRequest<Blob>(`${base(context)}/evidence/${encodeURIComponent(file.id)}/download`,{accessToken:context.accessToken,skipUnauthorizedRecovery:true,responseType:'blob',signal});
  if(!blob||typeof blob.size!=='number'||typeof blob.arrayBuffer!=='function'||blob.size!==file.sizeBytes||blob.type!==file.mimeType)throw new ApiResponseError();
  return blob;
}
