import type { Prisma } from '@prisma/client';
import { readPaymentClosingSources } from '../../payment/payment.contract';
import { readFinanceRegisteredCash } from './finance-composition.money';
import { financeNativeTransaction } from './finance-composition.public';
import { loadFinanceSources } from './finance-report.loader';
import { mapFinanceReport } from './finance-report.mapper';
import type { FinanceSqlTransaction } from './finance-v2.repository';

jest.mock('../../payment/payment.contract',()=>({...jest.requireActual<typeof import('../../payment/payment.contract')>('../../payment/payment.contract'),readPaymentClosingSources:jest.fn()}));
jest.mock('./finance-composition.public',()=>({financeNativeTransaction:jest.fn()}));
jest.mock('./finance-report.loader',()=>({loadFinanceSources:jest.fn()}));
jest.mock('./finance-report.mapper',()=>({mapFinanceReport:jest.fn()}));

const businessId='business',accountId='account',asOf='2026-10-05T15:00:00+03:00';
function fixture(stale=false){
  const native={business:{findMany:jest.fn().mockResolvedValue([{timezone:'UTC'}])}}as unknown as Prisma.TransactionClient;
  const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('NO_WRITES')),query<T extends object>():Promise<T[]>{return Promise.resolve([{stale}]as unknown as T[]);}};
  jest.mocked(financeNativeTransaction).mockReturnValue(native);
  jest.mocked(readPaymentClosingSources).mockResolvedValue({complete:true,payload:{payments:[],adjustments:[]},sourceRefs:[],sourceToken:'current'});
  jest.mocked(loadFinanceSources).mockResolvedValue({bounds:{from:new Date('2026-10-05'),to:new Date('2026-10-06')}}as unknown as Awaited<ReturnType<typeof loadFinanceSources>>);
  jest.mocked(mapFinanceReport).mockReturnValue({accounts:[{id:accountId,balanceMinor:1000000}],balanceSources:[]}as unknown as ReturnType<typeof mapFinanceReport>);
  return{tx,native};
}
beforeEach(()=>{jest.clearAllMocks();jest.useFakeTimers({now:new Date('2026-10-06T18:00:00Z')});});
afterEach(()=>jest.useRealTimers());
describe('Registered cash same-tx public cut composition (unit fixtures, no DB)',()=>{
  it('uses one actual currentDate for public provenance and the normalized inclusive requested cut for unchanged V1 cash mapping',async()=>{const f=fixture(),result=await readFinanceRegisteredCash(f.tx,businessId,asOf,[accountId]);expect(result.balanceMinor).toBe(1000000);expect(readPaymentClosingSources).toHaveBeenCalledWith(f.native,businessId,new Date('2026-10-06T18:00:00Z'));expect(readPaymentClosingSources).toHaveBeenCalledTimes(1);const call=jest.mocked(mapFinanceReport).mock.calls[0];expect(call.slice(0,3)).toEqual([{businessId,actorUserId:''},{from:'2026-10-05',to:'2026-10-06'},'UTC']);expect(call[3].bounds.to).toEqual(new Date('2026-10-05T12:00:00.001Z'));expect(call[4]).toEqual(new Date('2026-10-05T12:00:00Z'));});
  it('rejects stale provenance before loading or mapping V1 current cash',async()=>{const f=fixture(true);await expect(readFinanceRegisteredCash(f.tx,businessId,asOf,[accountId])).rejects.toThrow('SOURCE_STALE');expect(loadFinanceSources).not.toHaveBeenCalled();expect(mapFinanceReport).not.toHaveBeenCalled();});
});
