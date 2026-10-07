import { createHash } from 'node:crypto';
import { FinanceConflictError } from '../domain/finance.errors';
import { sumMoney } from '../domain/finance-money';
export interface FinanceReceivableSource {
  sourceKey: string; bookingId: string; amountMinor: number; dueOn: string | null;
  sourceVersion: number; needsReview: boolean;
}
export interface FinanceReceivableEvidence {
  rows: readonly FinanceReceivableSource[]; credits: readonly { bookingId: string; amountMinor: number }[];
  reviewBookingIds: readonly string[]; token: string;
}

export interface FinanceBookingFinancialBasis {
  bookingId:string; sourceVersion:number; currency:'PYG'; pricingStatus:'CURRENT'|'MISSING'|'REVIEW';
  agreedMinor:number|null; pricingToken:string;
}
export interface FinancePaymentObligationBasis {
  complete:boolean; token:string;
  payments:readonly {id:string;bookingId:string;currency:string;status:string;netRetainedAmountMinor:number;paymentVersion:number}[];
  paymentPlans:readonly {id:string;bookingId:string;currency:string;totalAmountMinor:number}[];
  installments:readonly {id:string;paymentPlanId:string;amountMinor:number;dueDate:string|null}[];
  applications:readonly {paymentId:string;installmentId:string;effectiveAmountMinor:number}[];
}
export function composeFinanceReceivables(bookings:readonly FinanceBookingFinancialBasis[],payment:FinancePaymentObligationBasis):FinanceReceivableEvidence {
  if(!payment.complete)throw new FinanceConflictError('La fuente de planes no reconstruye el corte pedido.');
  if(bookings.length+payment.payments.length+payment.installments.length>5000)throw new FinanceConflictError('La consulta supera 5000 fuentes.');
  const rows:FinanceReceivableSource[]=[];const credits:FinanceReceivableEvidence['credits'][number][]=[];const reviewBookingIds:string[]=[];
  for(const booking of bookings){
    const result=bookingReceivable(booking,payment);
    rows.push(...result.rows);credits.push(...result.credits);reviewBookingIds.push(...result.reviewBookingIds);
  }
  if(new Set(bookings.map(row=>row.bookingId)).size!==bookings.length)throw new FinanceConflictError('La lectura repite una reserva.');
  const token=createHash('sha256').update(JSON.stringify({bookings,paymentToken:payment.token,rows,credits,reviewBookingIds})).digest('hex');
  return{rows,credits,reviewBookingIds,token};
}
type BookingReceivable=Pick<FinanceReceivableEvidence,'rows'|'credits'|'reviewBookingIds'>;
function bookingPayments(booking:FinanceBookingFinancialBasis,payment:FinancePaymentObligationBasis):{own:FinancePaymentObligationBasis['payments'];paid:number}{
  const own=payment.payments.filter(row=>row.bookingId===booking.bookingId&&row.status==='RECORDED');
  if(booking.currency!=='PYG'||own.some(row=>row.currency!=='PYG'))throw new FinanceConflictError('Finance no convierte monedas de obligaciones históricas.');
  const paid=sumMoney(own.map(row=>row.netRetainedAmountMinor));
  if(paid<0)throw new FinanceConflictError('El neto de cobros es inválido.');
  return{own,paid};
}
function bookingReceivable(booking:FinanceBookingFinancialBasis,payment:FinancePaymentObligationBasis):BookingReceivable{
  const{own,paid}=bookingPayments(booking,payment);
  if(booking.pricingStatus!=='CURRENT'||booking.agreedMinor===null)return{rows:[],credits:[],reviewBookingIds:[booking.bookingId]};
  if(!Number.isSafeInteger(booking.agreedMinor)||booking.agreedMinor<0)throw new FinanceConflictError('Precio acordado inválido.');
  const difference=sumMoney([booking.agreedMinor,-paid]);
  if(difference<=0)return{rows:[],credits:difference<0?[{bookingId:booking.bookingId,amountMinor:-difference}]:[],reviewBookingIds:[]};
  const due=explicitInstallmentDebt(booking,payment,own,paid,difference);
  if(due===null)return{rows:[bookingDebt(booking,difference,false)],credits:[],reviewBookingIds:[]};
  return{rows:due.rows,credits:[],reviewBookingIds:due.needsReview?[booking.bookingId]:[]};
}
function bookingDebt(booking:FinanceBookingFinancialBasis,amountMinor:number,needsReview:boolean):FinanceReceivableSource{
  return{sourceKey:`BOOKING:${booking.bookingId}`,bookingId:booking.bookingId,amountMinor,dueOn:null,sourceVersion:booking.sourceVersion,needsReview};
}
function explicitInstallmentDebt(booking:FinanceBookingFinancialBasis,payment:FinancePaymentObligationBasis,own:FinancePaymentObligationBasis['payments'],paid:number,outstanding:number):{rows:FinanceReceivableSource[];needsReview:boolean}|null{
  const plans=payment.paymentPlans.filter(row=>row.bookingId===booking.bookingId);
  if(plans.length===0)return null;
  const review=()=>({rows:[bookingDebt(booking,outstanding,true)],needsReview:true});
  if(plans.length!==1||plans[0].currency!=='PYG'||plans[0].totalAmountMinor!==booking.agreedMinor)return review();
  const plan=plans[0];const installments=payment.installments.filter(row=>row.paymentPlanId===plan.id);
  if(sumMoney(installments.map(row=>row.amountMinor))!==plan.totalAmountMinor)throw new FinanceConflictError('Las cuotas no conservan el plan.');
  const applications=payment.applications.filter(row=>own.some(source=>source.id===row.paymentId));
  if(applications.some(row=>!installments.some(source=>source.id===row.installmentId))||sumMoney(applications.map(row=>row.effectiveAmountMinor))!==paid)return review();
  const rows=installmentDebtRows(booking,installments,applications);
  if(sumMoney(rows.map(row=>row.amountMinor))!==outstanding)return review();
  return{rows,needsReview:false};
}
function installmentDebtRows(booking:FinanceBookingFinancialBasis,installments:FinancePaymentObligationBasis['installments'],applications:FinancePaymentObligationBasis['applications']):FinanceReceivableSource[]{
  const rows:FinanceReceivableSource[]=[];
  for(const installment of installments){
    const applied=sumMoney(applications.filter(row=>row.installmentId===installment.id).map(row=>row.effectiveAmountMinor));
    const amountMinor=sumMoney([installment.amountMinor,-applied]);
    if(amountMinor<0)throw new FinanceConflictError('La cuota tiene aplicación superior a su importe.');
    if(amountMinor>0)rows.push({sourceKey:`PAYMENT_INSTALLMENT:${installment.id}`,bookingId:booking.bookingId,amountMinor,dueOn:installment.dueDate,sourceVersion:booking.sourceVersion,needsReview:false});
  }
  return rows;
}
