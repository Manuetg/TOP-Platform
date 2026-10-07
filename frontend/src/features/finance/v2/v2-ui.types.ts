import type { FinanceContext } from '../api/finance-api';
import type { FinanceReport } from '../types/finance.types';
import type { FinanceBankMatchSourceDto, FinanceAllocationRuleDto, FinanceApprovalPolicyDto, FinanceBankMatchDto, FinanceBankStatementDto, FinanceBudgetDto, FinanceCommitmentDto, FinanceCostReport, FinanceExpenseDraftDto, FinanceExpenseTemplateDto, FinanceLaborCostDto, FinanceV2Capability } from './finance-v2.types';

export type FinanceV2View = 'planning' | 'reconciliation' | 'results' | 'corrections' | 'close';
export const financeV2Views = [{ id:'planning',label:'Planificación' },{ id:'reconciliation',label:'Conciliación' },{ id:'results',label:'Resultados' },{ id:'corrections',label:'Correcciones' },{ id:'close',label:'Cierre' }] as const;
export type FinanceBankMatchSource = FinanceBankMatchSourceDto;
export interface FinanceV2Access { role: string; capabilities: readonly string[]; availableSections: readonly string[] }
export interface FinanceV2References {
  report: FinanceReport;
  bookings: readonly { id: string; label: string }[];
}
export interface FinanceV2Data {
  drafts: FinanceExpenseDraftDto[]; templates: FinanceExpenseTemplateDto[]; policy: FinanceApprovalPolicyDto;
  bankStatements: FinanceBankStatementDto[]; bankMatches: FinanceBankMatchDto[]; bankSources: FinanceBankMatchSource[];
  allocationRules: FinanceAllocationRuleDto[]; laborCosts: FinanceLaborCostDto[]; budget: FinanceBudgetDto | null;
  commitments: FinanceCommitmentDto[]; costs: FinanceCostReport | null;
  budgetMonth: string; budgetLoaded: boolean;
}
export interface FinanceV2WorkspaceProps { context: FinanceContext; businessName: string; view: FinanceV2View; access: FinanceV2Access; references: FinanceV2References; period: { from:string;to:string }; active?: boolean }
export function canFinanceV2(access: FinanceV2Access, capability: FinanceV2Capability | string) { return access.role === 'OWNER' && access.capabilities.includes(capability); }
export function sectionReady(access: FinanceV2Access, section: string) { return access.availableSections.includes(section); }
export function bankSourceKey(source:FinanceBankMatchSource) { return `${source.ref.sourceType}:${source.ref.sourceId}:${source.ref.sourceLeg??''}`; }
