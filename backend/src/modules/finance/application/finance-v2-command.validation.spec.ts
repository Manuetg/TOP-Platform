import { financeV2Fingerprint,parseFinanceV2Command } from './finance-v2-command.validation';
const id='00000000-0000-4000-8000-000000000001';
const definition={description:'Compra',counterpartyId:null,reference:null,amountMinor:100,lines:[{label:'Costo',categoryId:id,resourceId:null,bookingId:null,amountMinor:100,operational:true}]};
describe('closed Finance V2 command inputs',()=>{
  it('normalizes equivalent object order before fingerprints',()=>{
    const a=parseFinanceV2Command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition:definition,consumedOn:'2026-10-04',dueOn:null});
    const b=parseFinanceV2Command({dueOn:null,consumedOn:'2026-10-04',expenseDefinition:{...definition,description:' Compra '},type:'CREATE_EXPENSE_DRAFT'});
    expect(financeV2Fingerprint(a)).toBe(financeV2Fingerprint(b));
  });
  it.each(['DELETE_EXPENSE','SET_RAW_BALANCE','PAYROLL_RUN','CONFIRM_TAX','CREATE_BANK_FEED'])('rejects unimplemented %s',type=>{expect(()=>parseFinanceV2Command({type})).toThrow();});
  it.each(['actorUserId','businessId','currency','version','approved','role'])('rejects privileged field %s',key=>{expect(()=>parseFinanceV2Command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition:definition,consumedOn:'2026-10-04',dueOn:null,[key]:id})).toThrow();});
  it('rejects nested unknown fields and total mismatch',()=>{
    expect(()=>parseFinanceV2Command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition:{...definition,paymentId:id},consumedOn:'2026-10-04',dueOn:null})).toThrow();
    expect(()=>parseFinanceV2Command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition:{...definition,amountMinor:101},consumedOn:'2026-10-04',dueOn:null})).toThrow();
  });
  it.each([null,{},[],{type:'CONVERT_COMMITMENT',id,expectedVersion:1,reason:'x',expenseDraftId:id,expectedDraftVersion:1,expense:{...definition,consumedOn:'2026-10-04',dueOn:null,settlement:null}}])('rejects incomplete or ambiguous conversions',value=>{expect(()=>parseFinanceV2Command(value)).toThrow();});
  it('rejects unsafe money, impossible date, naive timestamp and arbitrary approval scope',()=>{
    expect(()=>parseFinanceV2Command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition:{...definition,amountMinor:9007199254740992},consumedOn:'2026-10-04',dueOn:null})).toThrow();
    expect(()=>parseFinanceV2Command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition:definition,consumedOn:'2026-02-30',dueOn:null})).toThrow();
    expect(()=>parseFinanceV2Command({type:'REIMBURSE_EXPENSE',expenseId:id,expectedVersion:1,settlement:{accountId:id,amountMinor:10,occurredAt:'2026-10-04T10:00:00',reference:null},reason:'Pago'})).toThrow();
    expect(()=>parseFinanceV2Command({type:'SET_EXPENSE_APPROVAL_POLICY',enabled:true,scope:'THRESHOLD',expectedPolicyVersion:0,requireDifferentActor:true,reason:'Regla'})).toThrow();
  });
});
