import { useEffect } from 'react';
import { useAuth } from '../../auth/context/AuthContext';
import { useBusinessContext } from '../../business/context/BusinessContext';
import { reconcileFinanceIntentAuthority } from './use-finance-intent';

export function FinanceIntentSessionBoundary() {
  const { session, status } = useAuth();
  const { activeBusinessId, activeRole } = useBusinessContext();
  const userId = status === 'authenticated' ? session?.user.id : undefined;
  useEffect(() => {
    if (userId && activeBusinessId && activeRole) {
      reconcileFinanceIntentAuthority({ userId, businessId: activeBusinessId, role: activeRole });
    }
  }, [userId, activeBusinessId, activeRole]);
  return null;
}
