import { parseGuaranies,formatGuaraniesInput } from '../../../shared/utils/money';
import type { FinanceV2Command,FinanceV2CommandType,ExpenseDefinition,ExpenseDefinitionLine,FinanceV2Capability,FinanceBankMatchPreviewInput } from './finance-v2.types';
import type { FinanceV2Data,FinanceV2References,FinanceV2View } from './v2-ui.types';
import { bankSourceKey } from './v2-ui.types';

export const v2CommandLabels:Record<FinanceV2CommandType,string>={
  CONFIRM_HISTORY_IMPORT:'Importar historia propia',CONFIRM_BANK_STATEMENT:'Importar extracto manual',CREATE_EXPENSE_TEMPLATE:'Crear plantilla de gasto',REVISE_EXPENSE_TEMPLATE:'Revisar plantilla',GENERATE_RECURRING_DRAFT:'Generar borrador del mes',CREATE_EXPENSE_DRAFT:'Crear borrador de gasto',EDIT_EXPENSE_DRAFT:'Editar borrador',SUBMIT_EXPENSE_DRAFT:'Enviar borrador',WITHDRAW_EXPENSE_DRAFT:'Retirar borrador',DECIDE_EXPENSE_DRAFT:'Decidir aprobación',CONFIRM_EXPENSE_DRAFT:'Confirmar gasto aprobado',SET_EXPENSE_APPROVAL_POLICY:'Configurar aprobación',CREATE_REIMBURSEMENT_DRAFT:'Registrar gasto pagado por otra persona',REIMBURSE_EXPENSE:'Registrar reintegro',CONFIRM_BANK_MATCH:'Confirmar correspondencia del extracto',CANCEL_BANK_MATCH:'Cancelar correspondencia',CREATE_ALLOCATION_RULE:'Crear regla de reparto',REVISE_ALLOCATION_RULE:'Revisar regla de reparto',APPLY_COST_ALLOCATION:'Aplicar reparto a un costo',CREATE_LABOR_COST:'Registrar costo de personal o trabajo propio',REVISE_LABOR_COST:'Revisar costo de personal',CREATE_BUDGET_REVISION:'Crear revisión de presupuesto',APPROVE_BUDGET_REVISION:'Aprobar presupuesto',CREATE_COMMITMENT:'Registrar compromiso',CANCEL_COMMITMENT:'Cancelar compromiso',CONVERT_COMMITMENT:'Convertir compromiso en gasto',
};
export function commandView(type:FinanceV2CommandType):FinanceV2View {
  if(['CONFIRM_BANK_STATEMENT','CONFIRM_BANK_MATCH','CANCEL_BANK_MATCH'].includes(type)) return 'reconciliation';
  if(['CREATE_ALLOCATION_RULE','REVISE_ALLOCATION_RULE','APPLY_COST_ALLOCATION','CREATE_LABOR_COST','REVISE_LABOR_COST'].includes(type)) return 'results';
  return 'planning';
}
export function commandCapability(type:FinanceV2CommandType):FinanceV2Capability {
  if(['CONFIRM_HISTORY_IMPORT','CONFIRM_BANK_STATEMENT','CONFIRM_BANK_MATCH','CANCEL_BANK_MATCH'].includes(type)) return 'finance.import';
  if(['CREATE_LABOR_COST','REVISE_LABOR_COST'].includes(type)) return 'finance.labor';
  if(['DECIDE_EXPENSE_DRAFT','SET_EXPENSE_APPROVAL_POLICY','APPROVE_BUDGET_REVISION'].includes(type)) return 'finance.approve';
  if(['CREATE_BUDGET_REVISION','CREATE_COMMITMENT','CANCEL_COMMITMENT','CONVERT_COMMITMENT'].includes(type)) return 'finance.planning';
  return 'finance.write';
}
export type ExpenseLineDraft={label:string;amount:string;categoryId:string;resourceId:string;bookingId:string;operational:boolean};
export interface ExpenseDraft { description:string;amount:string;counterpartyId:string;reference:string;lines:ExpenseLineDraft[] }
export interface BankFeeDraft { bankRowId:string;mode:'NEW'|'EXISTING';expenseId:string;settlementId:string;consumedOn:string;occurredAt:string;reference:string;expense:ExpenseDraft }
export interface V2FormDraft {
  name:string;targetId:string;templateId:string;description:string;amount:string;month:string;date:string;dueOn:string;reason:string;
  namespace:string;csv:string;previewToken:string;accountId:string;occurredAt:string;reference:string;paid:boolean;settlementAmount:string;
  expense:ExpenseDraft;policyEnabled:boolean;decision:'APPROVE'|'REJECT';creditorId:string;supplierId:string;externallyPaidOn:string;privateReference:string;
  validFrom:string;validTo:string;parts:{resourceId:string;percentage:string}[];sourceId:string;ruleId:string;
  personLabel:string;laborKind:'PRECOMPUTED_LABOR'|'OWNER_IMPUTED';actualLineId:string;estimatedAmount:string;
  budgetLines:{categoryId:string;resourceId:string;amount:string}[];categoryId:string;resourceId:string;operational:boolean;
  conversionMode:'NEW'|'DRAFT';conversionDraftId:string;bankRows:{id:string;amount:string}[];bankComponents:{sourceId:string;amount:string;linkAccount:boolean}[];
  bankFees:BankFeeDraft[];
}
export const blankExpense=():ExpenseDraft=>({description:'',amount:'',counterpartyId:'',reference:'',lines:[{label:'',amount:'',categoryId:'',resourceId:'',bookingId:'',operational:true}]});
export function initialV2Draft(today:string):V2FormDraft {
  return {name:'',targetId:'',templateId:'',description:'',amount:'',month:today.slice(0,7),date:today,dueOn:'',reason:'',namespace:'',csv:'',previewToken:'',accountId:'',occurredAt:new Date().toISOString().slice(0,16),reference:'',paid:false,settlementAmount:'',expense:blankExpense(),policyEnabled:false,decision:'APPROVE',creditorId:'',supplierId:'',externallyPaidOn:today,privateReference:'',validFrom:today,validTo:'',parts:[{resourceId:'',percentage:'100'}],sourceId:'',ruleId:'',personLabel:'',laborKind:'PRECOMPUTED_LABOR',actualLineId:'',estimatedAmount:'',budgetLines:[{categoryId:'',resourceId:'',amount:''}],categoryId:'',resourceId:'',operational:true,conversionMode:'NEW',conversionDraftId:'',bankRows:[{id:'',amount:''}],bankComponents:[{sourceId:'',amount:'',linkAccount:false}],bankFees:[]};
}
export function v2Money(value:string,zero=false,signed=false):number {
  const negative=signed && value.trim().startsWith('-'); const result=parseGuaranies(negative?value.trim().slice(1):value,zero);
  if(result===null) throw new Error('Ingresa un importe entero en guaraníes, sin decimales.');return negative?-result:result;
}
export function v2Instant(value:string) { if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Indica fecha y hora UTC válidas.'); return new Date(`${value}:00.000Z`).toISOString(); }
export function v2Percentage(value:string) { const match=/^(\d{1,3})(?:[,.](\d{1,2}))?$/.exec(value.trim());if(!match)throw new Error('Indica un porcentaje con hasta dos decimales.');return Number(match[1])*100+Number((match[2]??'').padEnd(2,'0')); }
function selected<T extends {id:string}>(items:readonly T[],id:string,label:string):T { const item=items.find((entry)=>entry.id===id);if(!item)throw new Error(`Selecciona ${label} del negocio activo.`);return item; }
export function definition(draft:ExpenseDraft):ExpenseDefinition {
  return {description:draft.description.trim(),counterpartyId:draft.counterpartyId||null,reference:draft.reference.trim()||null,amountMinor:v2Money(draft.amount),lines:draft.lines.map((line):ExpenseDefinitionLine=>({label:line.label.trim(),categoryId:line.categoryId,resourceId:line.resourceId||null,bookingId:line.bookingId||null,amountMinor:v2Money(line.amount),operational:line.operational}))};
}
function settlement(draft:V2FormDraft) {return {accountId:draft.accountId,amountMinor:v2Money(draft.settlementAmount),occurredAt:v2Instant(draft.occurredAt),reference:draft.reference.trim()||null};}
export function bankMatchInput(draft:V2FormDraft,data:FinanceV2Data,references:FinanceV2References):FinanceBankMatchPreviewInput {
  const account=selected(references.report.accounts,draft.accountId,'una cuenta');
  if(!account.opening&&(draft.bankComponents.some((component)=>component.linkAccount)||draft.bankFees.some((fee)=>fee.mode==='NEW')))throw new Error('Registra primero la apertura de esta cuenta para asignar un cobro o registrar el pago de una comisión.');
  const allRows=data.bankStatements.flatMap((statement)=>statement.rows);
  const components=draft.bankComponents.map((entry)=>{const source=data.bankSources.find((item)=>bankSourceKey(item)===entry.sourceId);if(!source)throw new Error('Selecciona un origen monetario consultado del servidor.');return {...source.ref,sourceVersion:source.sourceVersion,sourceHash:source.sourceHash,amountMinor:v2Money(entry.amount,false,true)};});
  const paymentLinks=draft.bankComponents.filter((entry)=>entry.linkAccount).map((entry)=>{const source=data.bankSources.find((item)=>bankSourceKey(item)===entry.sourceId);if(!source||source.ref.sourceType!=='PAYMENT')throw new Error('Selecciona un cobro existente para asignarlo.');const payment=selected(references.report.payments,source.ref.sourceId,'el cobro original');return {paymentId:payment.id,expectedLinkVersion:payment.version,accountId:account.id,reason:draft.reason.trim()};});
  const fees=draft.bankFees.map((fee)=>{const row=selected(allRows,fee.bankRowId,'la fila de la comisión');if(fee.mode==='EXISTING'){const expense=selected(references.report.expenses,fee.expenseId,'el gasto de comisión original');const payment=selected(expense.settlements,fee.settlementId,'el pago de esa comisión');return {bankRowId:row.id,existingExpenseId:expense.id,existingSettlementId:payment.id};}return {bankRowId:row.id,expenseDefinition:definition(fee.expense),consumedOn:fee.consumedOn,occurredAt:v2Instant(fee.occurredAt),reference:fee.reference.trim()||null};});
  return {accountId:account.id,rows:draft.bankRows.map((entry)=>{const row=selected(allRows,entry.id,'una fila del extracto');return {id:row.id,version:row.version,amountMinor:v2Money(entry.amount,false,true)};}),components,paymentLinks,fees,reason:draft.reason.trim()};
}
export function buildV2Command(type:FinanceV2CommandType,draft:V2FormDraft,data:FinanceV2Data,references:FinanceV2References):FinanceV2Command {
  const reason=draft.reason.trim(); const dueOn=draft.dueOn||null;
  switch(type) {
    case 'CONFIRM_HISTORY_IMPORT': if(!draft.previewToken)throw new Error('Consulta una vista previa válida antes de importar.');return {type,sourceNamespace:draft.namespace.trim(),csv:draft.csv,previewToken:draft.previewToken,reason};
    case 'CONFIRM_BANK_STATEMENT': {const account=selected(references.report.accounts,draft.accountId,'una cuenta bancaria');if(!draft.previewToken)throw new Error('Consulta una vista previa válida antes de importar.');return {type,accountId:account.id,expectedAccountVersion:account.version,sourceNamespace:draft.namespace.trim(),csv:draft.csv,previewToken:draft.previewToken,reason};}
    case 'CREATE_EXPENSE_TEMPLATE': return {type,name:draft.name.trim(),expenseDefinition:definition(draft.expense)};
    case 'REVISE_EXPENSE_TEMPLATE': {const item=selected(data.templates,draft.targetId,'una plantilla');return {type,id:item.id,expectedVersion:item.version,expenseDefinition:definition(draft.expense),reason};}
    case 'GENERATE_RECURRING_DRAFT': {const item=selected(data.templates,draft.templateId,'una plantilla');return {type,templateId:item.id,expectedTemplateVersion:item.version,periodMonth:draft.month,consumedOn:draft.date,dueOn};}
    case 'CREATE_EXPENSE_DRAFT': return {type,expenseDefinition:definition(draft.expense),consumedOn:draft.date,dueOn};
    case 'CREATE_REIMBURSEMENT_DRAFT': return {type,expenseDefinition:definition(draft.expense),consumedOn:draft.date,dueOn,creditorCounterpartyId:draft.creditorId,supplierCounterpartyId:draft.supplierId||null,externallyPaidOn:draft.externallyPaidOn,privateReference:draft.privateReference.trim()||null};
    case 'EDIT_EXPENSE_DRAFT': {const item=selected(data.drafts,draft.targetId,'un borrador');return {type,id:item.id,expectedVersion:item.version,expenseDefinition:definition(draft.expense),consumedOn:draft.date,dueOn,reason};}
    case 'SUBMIT_EXPENSE_DRAFT': {const item=selected(data.drafts,draft.targetId,'un borrador');return {type,id:item.id,expectedVersion:item.version,expectedPolicyVersion:data.policy.version,reason};}
    case 'WITHDRAW_EXPENSE_DRAFT': {const item=selected(data.drafts,draft.targetId,'un borrador');return {type,id:item.id,expectedVersion:item.version,reason};}
    case 'DECIDE_EXPENSE_DRAFT': {const item=selected(data.drafts,draft.targetId,'un borrador');if(!item.approvalPolicyRevisionId)throw new Error('Este borrador no tiene una política de aprobación fijada.');return {type,id:item.id,expectedVersion:item.version,policyRevisionId:item.approvalPolicyRevisionId,decision:draft.decision,reason};}
    case 'CONFIRM_EXPENSE_DRAFT': {const item=selected(data.drafts,draft.targetId,'un borrador');return {type,id:item.id,expectedVersion:item.version,settlement:draft.paid?settlement(draft):null,reason};}
    case 'SET_EXPENSE_APPROVAL_POLICY': return {type,expectedPolicyVersion:data.policy.version,enabled:draft.policyEnabled,scope:'ALL_NEW_EXPENSE_CONFIRMATIONS',requireDifferentActor:true,reason};
    case 'REIMBURSE_EXPENSE': {const item=selected(references.report.expenses,draft.targetId,'el gasto del reintegro');return {type,expenseId:item.id,expectedVersion:item.version,settlement:settlement(draft),reason};}
    case 'CONFIRM_BANK_MATCH': if(!draft.previewToken)throw new Error('Consulta una correspondencia válida antes de confirmar.');return {type,...bankMatchInput(draft,data,references),previewToken:draft.previewToken};
    case 'CANCEL_BANK_MATCH': {const item=selected(data.bankMatches,draft.targetId,'una correspondencia');return {type,id:item.id,expectedVersion:item.version,reason};}
    case 'CREATE_ALLOCATION_RULE': return {type,name:draft.name.trim(),validFrom:draft.validFrom,validTo:draft.validTo||null,parts:draft.parts.map((part)=>({resourceId:part.resourceId,basisPoints:v2Percentage(part.percentage)}))};
    case 'REVISE_ALLOCATION_RULE': {const item=selected(data.allocationRules,draft.targetId,'una regla');return {type,id:item.id,expectedVersion:item.version,validFrom:draft.validFrom,validTo:draft.validTo||null,parts:draft.parts.map((part)=>({resourceId:part.resourceId,basisPoints:v2Percentage(part.percentage)})),reason};}
    case 'APPLY_COST_ALLOCATION': {const source=data.costs?.rows.find((row)=>`${row.source.kind}:${row.source.id}`===draft.sourceId);if(!source)throw new Error('Selecciona un costo con origen consultado.');const rule=selected(data.allocationRules,draft.ruleId,'una regla');return {type,source:{kind:source.source.kind,id:source.source.id},expectedSourceVersion:source.source.version,ruleId:rule.id,ruleVersion:rule.version,expectedAllocationVersion:source.allocationVersion,reason};}
    case 'CREATE_LABOR_COST': return {type,label:draft.name.trim(),personLabel:draft.personLabel.trim()||null,periodMonth:draft.month,consumedOn:draft.date,kind:draft.laborKind,actualExpenseLineId:draft.actualLineId||null,estimatedMinor:draft.estimatedAmount?v2Money(draft.estimatedAmount,false,true):null,reason};
    case 'REVISE_LABOR_COST': {const item=selected(data.laborCosts,draft.targetId,'un costo de personal');return {type,id:item.id,expectedVersion:item.version,actualExpenseLineId:draft.actualLineId||null,estimatedMinor:draft.estimatedAmount?v2Money(draft.estimatedAmount,false,true):null,reason};}
    case 'CREATE_BUDGET_REVISION': if(!data.budgetLoaded||data.budgetMonth!==draft.month)throw new Error('Consulta el presupuesto del mes elegido antes de registrar una revisión.');return {type,periodMonth:draft.month,expectedBudgetVersion:data.budget?.version??0,lines:draft.budgetLines.map((line)=>({categoryId:line.categoryId||null,resourceId:line.resourceId||null,approvedMinor:v2Money(line.amount,true)})),reason};
    case 'APPROVE_BUDGET_REVISION': if(!data.budget)throw new Error('No hay presupuesto para aprobar.');return {type,id:data.budget.id,expectedBudgetVersion:data.budget.version,reason};
    case 'CREATE_COMMITMENT': return {type,description:draft.description.trim(),amountMinor:v2Money(draft.amount),categoryId:draft.categoryId||null,resourceId:draft.resourceId||null,expectedConsumptionOn:draft.date,dueOn,operational:draft.operational,reference:draft.reference.trim()||null,reason};
    case 'CANCEL_COMMITMENT': {const item=selected(data.commitments,draft.targetId,'un compromiso');return {type,id:item.id,expectedVersion:item.version,reason};}
    case 'CONVERT_COMMITMENT': {const item=selected(data.commitments,draft.targetId,'un compromiso');if(draft.conversionMode==='DRAFT'){const expenseDraft=selected(data.drafts,draft.conversionDraftId,'un borrador aprobado');return {type,id:item.id,expectedVersion:item.version,expenseDraftId:expenseDraft.id,expectedDraftVersion:expenseDraft.version,expense:null,reason};}return {type,id:item.id,expectedVersion:item.version,expenseDraftId:null,expectedDraftVersion:null,expense:{...definition(draft.expense),consumedOn:draft.date,dueOn,settlement:draft.paid?settlement(draft):null},reason};}
  }
}
export function expenseDraftFromDefinition(value:ExpenseDefinition):ExpenseDraft {return {description:value.description,amount:formatGuaraniesInput(String(value.amountMinor)),counterpartyId:value.counterpartyId??'',reference:value.reference??'',lines:value.lines.map((line)=>({label:line.label,amount:formatGuaraniesInput(String(line.amountMinor)),categoryId:line.categoryId,resourceId:line.resourceId??'',bookingId:line.bookingId??'',operational:line.operational}))};}
