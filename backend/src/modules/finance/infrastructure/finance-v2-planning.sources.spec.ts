import { FinanceV2PlanningReadService,type FinancePlanningPublicReaders } from './finance-v2-planning.read-service';
import type { FinanceBankReadHost } from './finance-v2-bank.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceReceivableEvidence } from '../application/finance-v2-receivable.rules';

const businessId='11111111-1111-4111-8111-111111111111',actorUserId='22222222-2222-4222-8222-222222222222',accountId='33333333-3333-4333-8333-333333333333';
const input={asOf:'2026-10-05T12:00:00Z',horizonTo:'2026-11-01',baseToken:'',accountIds:[accountId],events:[],excludedSourceKeys:[]};
const payable={id:'expense-real-key',version:1,amountMinor:900000n,paid:300000n,dueOn:null};
const commitment={id:'commitment-real-key',version:1,amountMinor:800000n,consumed:200000n,dueOn:new Date('2026-10-10')};
function fixture(options:{many?:boolean;role?:string;review?:boolean}={}){
  const seen:FinanceSqlTransaction[]=[];
  const tx:FinanceSqlTransaction={query<T extends object>(sql:string):Promise<T[]>{
    if(sql.includes('FROM "User"'))return Promise.resolve([{status:'ACTIVE',role:options.role??'OWNER',currency:'PYG',timeZone:'America/Asuncion'}]as unknown as T[]);
    if(sql.includes('AS "stale"'))return Promise.resolve([{stale:false}]as unknown as T[]);
    if(sql.includes('FROM "FinanceExpense"'))return Promise.resolve([payable]as unknown as T[]);
    if(sql.includes('FROM "FinanceCommitment"'))return Promise.resolve((options.many?Array.from({length:5000},(_,index)=>({...commitment,id:`commitment-${index}`})):[commitment])as unknown as T[]);
    throw new Error(`Unexpected SQL ${sql}`);
  },execute(){return Promise.reject(new Error('READ_ONLY_PREVIEW'));}};
  const host:FinanceBankReadHost={read:work=>work(tx)};
  const evidence:FinanceReceivableEvidence={rows:[{sourceKey:'INSTALLMENT:authoritative-key',bookingId:'booking-key',amountMinor:100000,dueOn:null,sourceVersion:1,needsReview:options.review??false}],credits:[],reviewBookingIds:options.review?['booking-key']:[],token:'real-public-port-token'};
  const readers:FinancePlanningPublicReaders={receivables(current){seen.push(current);return Promise.resolve(evidence);},cash(current){seen.push(current);return Promise.resolve({balanceMinor:1000000,unknownAccountIds:[],token:'cash-public-port-token'});}};
  return{seen,tx,service:new FinanceV2PlanningReadService(host,readers)};
}
describe('Same-snapshot planning source catalog (unit ports; no DB)',()=>{
  it('bootstrap exposes exact real keys/pending amounts including undated sources without generating forecast events',async()=>{
    const f=fixture(),result=await f.service.planningPreview({businessId,actorUserId},input);
    expect(result.sources).toEqual([{sourceKey:'EXPENSE:expense-real-key',origin:'PAYABLE',direction:'OUT',amountMinor:600000,expectedOn:null,accountId:null,reviewRequired:false},{sourceKey:'INSTALLMENT:authoritative-key',origin:'RECEIVABLE',direction:'IN',amountMinor:100000,expectedOn:null,accountId:null,reviewRequired:false},{sourceKey:'COMMITMENT:commitment-real-key',origin:'COMMITMENT',direction:'OUT',amountMinor:600000,expectedOn:'2026-10-10',accountId:null,reviewRequired:false}]);
    expect(result.events).toEqual([]);expect(result.forecastDeltaMinor).toBe(0);expect(f.seen).toEqual([f.tx,f.tx]);
  });
  it('shows review blockers and refuses using that source while preserving explicit null date',async()=>{
    const f=fixture({review:true}),base=await f.service.planningPreview({businessId,actorUserId},input);
    expect(base.sources.find(source=>source.origin==='RECEIVABLE')).toMatchObject({reviewRequired:true,expectedOn:null});
    await expect(f.service.planningPreview({businessId,actorUserId},{...input,baseToken:base.token,events:[{sourceKey:'INSTALLMENT:authoritative-key',direction:'IN',amountMinor:100000,expectedOn:'2026-10-10',probabilityBasisPoints:10000,accountId,reason:'Requires source review.'}]})).rejects.toThrow('fuente');
  });
  it('bounds the combined real catalog rather than separately allowing 5000 commitments plus obligations',async()=>{
    const f=fixture({many:true});await expect(f.service.planningPreview({businessId,actorUserId},input)).rejects.toThrow('5000');
  });
  it('denies nonOwner before reading any catalog/public money data',async()=>{
    const f=fixture({role:'VIEWER'});await expect(f.service.planningPreview({businessId,actorUserId},input)).rejects.toThrow('autorizado');expect(f.seen).toEqual([]);
  });
});
