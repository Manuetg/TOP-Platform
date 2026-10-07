import type { PaymentClosingSources } from '../../payment/payment.contract';
import { assertFinanceCashCut } from './finance-v2-cash.cut';
import type { FinanceSqlTransaction } from './finance-v2.repository';

const businessId='business',cut='2026-10-05T12:00:00.000Z';
const payment={id:'payment',businessId,paidAt:'2026-10-01T00:00:00Z',createdAt:'2026-10-01T01:00:00Z'};
const adjustment={id:'adjustment',businessId,paymentId:payment.id,kind:'REFUND',occurredAt:'2026-10-02T00:00:00Z',createdAt:'2026-10-06T00:00:00Z'};
function source(payments:object[]=[payment],adjustments:object[]=[]):PaymentClosingSources{return{complete:true,payload:{payments,adjustments},sourceRefs:[],sourceToken:'current-public-provenance'};}
function fixture(staleRows:object[]=[{stale:false}]){
  const calls:{sql:string;parameters:readonly unknown[]}[]=[];
  const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('NO_WRITES')),query<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>{calls.push({sql,parameters});return Promise.resolve(staleRows as T[]);}};return{tx,calls};
}
describe('Current cash provenance cut (public Payment fixture + own SQL; no DB)',()=>{
  it('rejects a backdated receipt created after the cut before touching Finance cash SQL',async()=>{const f=fixture();await expect(assertFinanceCashCut(f.tx,businessId,cut,source([{...payment,createdAt:adjustment.createdAt}]))).rejects.toThrow('SOURCE_STALE');expect(f.calls).toEqual([]);});
  it('rejects a later VOID against the original paidAt even when VOID occurredAt is after the cut',async()=>{const f=fixture();await expect(assertFinanceCashCut(f.tx,businessId,cut,source([payment],[{...adjustment,kind:'VOID',occurredAt:'2026-10-06T00:00:00Z'}]))).rejects.toThrow('SOURCE_STALE');expect(f.calls).toEqual([]);});
  it('rejects a backdated refund recorded after the cut',async()=>{const f=fixture();await expect(assertFinanceCashCut(f.tx,businessId,cut,source([payment],[adjustment]))).rejects.toThrow('SOURCE_STALE');expect(f.calls).toEqual([]);});
  it('rejects a future economic payment already recorded at the cut because the obligation port includes its net amount',async()=>{const f=fixture();await expect(assertFinanceCashCut(f.tx,businessId,cut,source([{...payment,paidAt:'2026-10-06T00:00:00Z'}]))).rejects.toThrow('SOURCE_STALE');expect(f.calls).toEqual([]);});
  it('rejects a future economic refund already recorded at the cut because the obligation port subtracts it',async()=>{const f=fixture();await expect(assertFinanceCashCut(f.tx,businessId,cut,source([payment],[{...adjustment,occurredAt:'2026-10-06T00:00:00Z',createdAt:payment.createdAt}]))).rejects.toThrow('SOURCE_STALE');expect(f.calls).toEqual([]);});
  it('does not project a future-dated receipt/refund into past cash; the unchanged V1 mapper will apply the economic cut',async()=>{const f=fixture();await assertFinanceCashCut(f.tx,businessId,cut,source([{...payment,paidAt:'2026-10-06T00:00:00Z',createdAt:adjustment.createdAt}],[{...adjustment,occurredAt:'2026-10-06T00:00:00Z'}]));expect(f.calls[0].parameters).toEqual([businessId,cut,[]]);});
  it.each([
    ['Settlement','s."occurredAt"<=$2::timestamp AND s."createdAt">$2::timestamp'],
    ['Transfer','t."occurredAt"<=$2::timestamp AND t."createdAt">$2::timestamp'],
    ['CashMovement','m."occurredAt"<=$2::timestamp AND m."createdAt">$2::timestamp'],
    ['Opening','o."occurredAt"<=$2::timestamp AND o."createdAt">$2::timestamp'],
    ['PaymentLink','l."paymentId"=ANY($3::text[]) AND l."createdAt">$2::timestamp'],
    ['Linked Audit','a."occurredAt">$2::timestamp'],
  ])('rejects an own stale %s rather than silently mapping current facts',async(_name,condition)=>{const f=fixture([{stale:true}]);await expect(assertFinanceCashCut(f.tx,businessId,cut,source())).rejects.toThrow('SOURCE_STALE');expect(f.calls[0].sql).toContain(condition);});
  it('normalizes offsets and scopes link/audit lookup to own payments with paidAt within the cut',async()=>{const f=fixture();await assertFinanceCashCut(f.tx,businessId,'2026-10-05T15:00:00+03:00',source());expect(f.calls[0].parameters).toEqual([businessId,cut,['payment']]);expect(f.calls[0].sql).toContain('l."businessId"=a."businessId"');expect(f.calls[0].sql).not.toMatch(/FROM "Payment(?:Adjustment)?"/);});
  it.each([{reason:'foreign payment',input:source([{...payment,businessId:'foreign'}])},{reason:'missing receipt',input:source([],[adjustment])},{reason:'invalid instant',input:source([{...payment,createdAt:'2026-02-30T00:00:00Z'}])},{reason:'incomplete public source',input:{...source(),complete:false}}])('fails closed for $reason',async({input})=>{const f=fixture();await expect(assertFinanceCashCut(f.tx,businessId,cut,input)).rejects.toThrow('SOURCE_STALE');expect(f.calls).toEqual([]);});
  it('rejects more than5000 public source rows rather than accepting truncated provenance',async()=>{const f=fixture();await expect(assertFinanceCashCut(f.tx,businessId,cut,source(Array.from({length:5001},(_,index)=>({...payment,id:String(index)}))))).rejects.toThrow('SOURCE_STALE');expect(f.calls).toEqual([]);});
  it('fails closed when the SQL guard has no scalar result',async()=>{const f=fixture([]);await expect(assertFinanceCashCut(f.tx,businessId,cut,source())).rejects.toThrow('SOURCE_STALE');});
});
