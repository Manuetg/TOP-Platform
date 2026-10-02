export const PAYMENT_RECONCILIATION_WARNING = 'El precio vigente y el plan de pagos requieren conciliación. Se conserva el historial sin reasignar cobros ni generar devoluciones.';

export interface FinancialPrice {
  currency: string;
  totalAmountMinor: number;
}

export interface FinancialPlan extends FinancialPrice {
  installmentTotalAmountMinor: number;
  appliedAmountMinor: number;
}

export function needsPaymentReconciliation(price: FinancialPrice, paidAmountMinor: number, plan: FinancialPlan | null): boolean {
  if (paidAmountMinor > price.totalAmountMinor) return true;
  if (!plan) return false;
  return plan.currency !== price.currency
    || plan.totalAmountMinor !== price.totalAmountMinor
    || plan.installmentTotalAmountMinor !== price.totalAmountMinor
    || plan.appliedAmountMinor < paidAmountMinor;
}
