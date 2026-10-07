import type { FinanceV2ReadRepository, FinanceV2Actor, FinanceHistoryPreviewInput, FinanceHistoryPreview, FinanceBankStatementPreviewInput, FinanceBankStatementPreview, FinanceBankMatchPreviewInput, FinanceBankMatchPreview, BankComponentRef } from '../domain/finance-v2.types';
import { FinanceInputError } from '../domain/finance.errors';
import { sumMoney } from '../domain/finance-money';
import { previewHistoryImport } from '../application/finance-v2-import';
import { previewBankMatch,previewBankStatement } from '../application/finance-v2-bank-match';
import { bankSourceKey } from '../application/finance-v2-bank-source';
import type { FinanceImportBankSnapshotReader } from './finance-v2-import-bank.ports';
import type { FinanceBankReadHost } from './finance-v2-bank.read-service';
import { authorizeFinanceV2Read } from './finance-v2-operational.read-service';
import { FinanceCsvPreviewError } from '../application/finance-v2-csv-preview.error';

export class FinanceV2EvidenceReadService implements Pick<FinanceV2ReadRepository,'importPreview'|'bankStatementPreview'|'bankMatchPreview'> {
  constructor(private readonly host:FinanceBankReadHost,private readonly reader:FinanceImportBankSnapshotReader){}
  importPreview(actor:FinanceV2Actor,input:FinanceHistoryPreviewInput):Promise<FinanceHistoryPreview>{
    return this.host.read(async tx=>{
      await authorizeFinanceV2Read(tx,actor);const request={...input,businessId:actor.businessId};
      const result=previewHistoryImport(request,await this.reader.history(tx,request));
      if(!result.valid)throw new FinanceCsvPreviewError(result.errors);
      return{businessId:actor.businessId,sourceNamespace:input.sourceNamespace.trim(),digest:result.canonicalDigest!,previewToken:result.previewToken,issues:[],sources:result.items.map(item=>({rowOrdinals:result.rows.filter(row=>row.source.externalKey===item.source.externalKey).map(row=>row.ordinal),externalKey:item.source.externalKey,kind:item.source.kind,amountMinor:item.source.amountMinor,existingSourceId:item.sourceId,status:item.status})),totals:{expenseMinor:sumMoney(result.items.filter(item=>item.source.kind==='EXPENSE').map(item=>item.source.amountMinor)),settlementMinor:sumMoney(result.items.filter(item=>item.source.kind==='SETTLEMENT').map(item=>item.source.amountMinor)),includedCashMinor:result.cash.includedDeltaMinor,excludedCashMinor:result.cash.excludedSettlementMinor}};
    });
  }
  bankStatementPreview(actor:FinanceV2Actor,input:FinanceBankStatementPreviewInput):Promise<FinanceBankStatementPreview>{
    return this.host.read(async tx=>{
      await authorizeFinanceV2Read(tx,actor);const request={...input,businessId:actor.businessId};
      const result=previewBankStatement(request,await this.reader.statement(tx,request));
      if(!result.valid)throw new FinanceCsvPreviewError(result.errors);
      return{businessId:actor.businessId,accountId:input.accountId,canonicalDigest:result.canonicalDigest!,previewToken:result.previewToken,issues:[],rows:result.items.map((item,index)=>({ordinal:index+1,...item.row,existingRowId:item.rowId}))};
    });
  }
  bankMatchPreview(actor:FinanceV2Actor,input:FinanceBankMatchPreviewInput):Promise<FinanceBankMatchPreview>{
    return this.host.read(async tx=>{
      await authorizeFinanceV2Read(tx,actor);const request={...input,businessId:actor.businessId};
      const result=previewBankMatch(request,await this.reader.match(tx,request));
      if(!result.valid)throw new FinanceInputError(result.errors.map(error=>`${error.code}: ${error.column??''}`).join('; '));
      return{businessId:actor.businessId,accountId:input.accountId,previewToken:result.previewToken,rowTotalMinor:result.rowTotalMinor!,componentTotalMinor:result.componentTotalMinor!,rows:result.rows.map(row=>({id:row.key,residualMinor:row.residualMinor})),sources:result.sources.map(source=>{const ref=input.components.find(component=>bankSourceKey(component)===source.key)!;return{source:componentRef(ref),residualMinor:source.residualMinor};}),staleReasons:result.staleReasons};
    });
  }
}
function componentRef(ref:BankComponentRef):BankComponentRef{
  if(ref.sourceType==='TRANSFER')return{sourceType:'TRANSFER',sourceId:ref.sourceId,sourceLeg:ref.sourceLeg};
  return{sourceType:ref.sourceType,sourceId:ref.sourceId,sourceLeg:null};
}
