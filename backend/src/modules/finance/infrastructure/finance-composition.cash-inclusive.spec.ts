import type { Prisma } from '@prisma/client';
import { readPaymentClosingSources } from '../../payment/payment.contract';
import { readFinanceRegisteredCash } from './finance-composition.money';
import { financeNativeTransaction } from './finance-composition.public';
import { loadFinanceSources,type FinanceSources } from './finance-report.loader';
import { mapFinanceReport } from './finance-report.mapper';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { FinanceInputError } from '../domain/finance.errors';

jest.mock('../../payment/payment.contract',()=>({...jest.requireActual<typeof import('../../payment/payment.contract')>('../../payment/payment.contract'),readPaymentClosingSources:jest.fn()}));
jest.mock('./finance-composition.public',()=>({financeNativeTransaction:jest.fn()}));
jest.mock('./finance-report.loader',()=>({loadFinanceSources:jest.fn()}));

const businessId='business',accountId='bank',asOf='2026-10-05T12:00:00.000Z',cut=new Date(asOf),before=new Date('2026-10-01T00:00:00.000Z');
function sources():FinanceSources{
  const opening={id:'opening',businessId,accountId,amountMinor:1000000n,occurredAt:before,reason:'Known own opening',recordedByUserId:'owner',createdAt:before};
  return{bounds:{from:new Date('2026-10-05T00:00:00Z'),to:new Date('2026-10-06T00:00:00Z')},catalogs:[],resources:[],accounts:[{id:accountId,businessId,name:'Own bank',kind:'BANK',archived:false,version:1,createdAt:before,opening}],expenses:[],settlements:[{id:'settlement',businessId,expenseId:'expense-outside-consumption-range',accountId,amountMinor:50000n,occurredAt:cut,reference:null,recordedByUserId:'owner',createdAt:before}],links:[{id:'link',businessId,paymentId:'payment',accountId,version:1,recordedByUserId:'owner',createdAt:cut}],transfers:[],cashMovements:[{id:'later',businessId,accountId,kind:'CONTRIBUTION',amountMinor:777000n,occurredAt:new Date(cut.getTime()+1),reason:'Later economic movement excluded',openingId:null,recordedByUserId:'owner',createdAt:before}],reviews:[],reviewOccurredAt:{},cashCounts:[],payments:[{id:'payment',bookingId:'booking',amountMinor:400000,currency:'PYG',paidAt:asOf,reference:null,paymentVersion:2}],paymentAdjustments:[{id:'refund',paymentId:'payment',bookingId:'booking',kind:'REFUND',amountMinor:100000,currency:'PYG',occurredAt:asOf,createdAt:before.toISOString(),sequence:1,accountId}]};
}
function fixture(){
  const loaded=sources(),native={business:{findMany:()=>Promise.resolve([{timezone:'UTC'}])}}as unknown as Prisma.TransactionClient;
  const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('NO_WRITES')),query<T extends object>():Promise<T[]>{return Promise.resolve([{stale:false}]as unknown as T[]);}};
  jest.mocked(financeNativeTransaction).mockReturnValue(native);
  jest.mocked(readPaymentClosingSources).mockResolvedValue({complete:true,payload:{payments:[{id:'payment',businessId,paidAt:asOf,createdAt:before.toISOString()}],adjustments:[{id:'refund',paymentId:'payment',businessId,kind:'REFUND',occurredAt:asOf,createdAt:before.toISOString()}]},sourceRefs:[],sourceToken:'public-current'});
  jest.mocked(loadFinanceSources).mockResolvedValue(loaded);return{loaded,tx};
}
beforeEach(()=>jest.clearAllMocks());
describe('V2 inclusive instant cash uses the real canonical V1 mapper (unit public/load ports only; no DB)',()=>{
  it('includes exact-at-cut receipt, refund, settlement and account link once, while excluding economic cut+1ms',async()=>{
    const f=fixture(),result=await readFinanceRegisteredCash(f.tx,businessId,asOf,[accountId]);
    expect(result.balanceMinor).toBe(1250000);expect(f.loaded.bounds.to).toEqual(new Date(cut.getTime()+1));
    const mapped=mapFinanceReport({businessId,actorUserId:'owner'},{from:'2026-10-05',to:'2026-10-06'},'UTC',f.loaded,cut);
    expect(mapped.balanceSources.map(row=>[row.sourceType,row.amountMinor])).toEqual([['OPENING',1000000],['PAYMENT',400000],['REFUND',-100000],['SETTLEMENT',-50000]]);
    expect(mapped.payments[0]).toMatchObject({paidAt:asOf,refundedAmountMinor:100000,netRetainedAmountMinor:300000,includedInBalance:true});expect(mapped.balanceSources.some(row=>row.sourceId==='later')).toBe(false);
  });
  it('preserves exact exclusive [from,to) behavior when V1 receives its original period bound',()=>{
    const loaded=sources();loaded.bounds.to=cut;const mapped=mapFinanceReport({businessId,actorUserId:'owner'},{from:'2026-10-05',to:'2026-10-06'},'UTC',loaded,cut);
    expect(mapped.accounts[0].balanceMinor).toBe(1000000);expect(mapped.balanceSources.map(row=>row.sourceType)).toEqual(['OPENING']);expect(mapped.payments).toEqual([]);
  });
  it('rejects the final supported millisecond instead of overflowing into a five-digit year',async()=>{
    const f=fixture();await expect(readFinanceRegisteredCash(f.tx,businessId,'9999-12-31T23:59:59.999Z',[accountId])).rejects.toBeInstanceOf(FinanceInputError);expect(loadFinanceSources).not.toHaveBeenCalled();
  });
});
