import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceReceivableEvidence } from './finance-v2-planning.read-service';
import { composeFinanceReceivables, FinanceBookingFinancialBasis, FinancePaymentObligationBasis } from '../application/finance-v2-receivable.rules';

export interface FinanceReceivablePublicSourceReaders {
  bookingPricing(tx:FinanceSqlTransaction,businessId:string,asOf:string):Promise<readonly FinanceBookingFinancialBasis[]>;
  paymentObligations(tx:FinanceSqlTransaction,businessId:string,asOf:string):Promise<FinancePaymentObligationBasis>;
}
export class FinanceV2ReceivableReader {
  constructor(private readonly sources:FinanceReceivablePublicSourceReaders){}
  async read(tx:FinanceSqlTransaction,businessId:string,asOf:string):Promise<FinanceReceivableEvidence>{
    const bookings=await this.sources.bookingPricing(tx,businessId,asOf);
    const payment=await this.sources.paymentObligations(tx,businessId,asOf);
    return composeFinanceReceivables(bookings,payment);
  }
}
