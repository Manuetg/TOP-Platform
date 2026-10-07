import type { FinanceContext } from '../api/finance-api';
import { executeV2Command } from './finance-v2-api';
import { useFinanceIntent } from './use-finance-intent';

export const financeV2Key = (context:FinanceContext)=>['finance',context.userId,context.businessId,'v2'] as const;
export function useV2Command(context:FinanceContext) { return useFinanceIntent(context, 'v2-commands', executeV2Command); }
export type V2CommandMutation=ReturnType<typeof useV2Command>;