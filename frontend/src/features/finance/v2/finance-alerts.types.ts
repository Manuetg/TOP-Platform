export type FinanceAlertKind='OVERDUE_PAYABLE'|'MISSING_EXPENSE_EVIDENCE'|'PENDING_SERVICE_EVIDENCE'|'UNRESOLVED_CASH_DIFFERENCE';
export type FinanceAlertTarget={type:'EXPENSE';id:string}|{type:'SERVICE_NIGHT';bookingId:string;localNight:string}|{type:'CASH_COUNT';id:string;accountId:string};
export interface FinanceDerivedAlert{id:string;kind:FinanceAlertKind;sourceId:string;sourceVersion:string;severity:'ACTION'|'REVIEW';title:string;description:string;amountMinor:number|null;target:FinanceAlertTarget}
export interface FinanceAlertsReadResult{businessId:string;currency:'PYG';timeZone:string;from:string;to:string;asOf:string;today:string;token:string;basis:'CURRENT_OPERATIONS_AND_SERVICE_COVERAGE';items:FinanceDerivedAlert[]}
