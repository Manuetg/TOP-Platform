import { ErrorBoundary } from "./shared/ui/ErrorBoundary";
import { ErrorFallback } from "./app/errors/ErrorFallback";
import { AppRouter } from "./app/router/AppRouter";
import { QueryProvider } from "./app/providers/QueryProvider";
import { AuthProvider } from "./features/auth/context/AuthContext";
import { BusinessProvider } from "./features/business/context/BusinessContext";
import { DeploymentNotice } from "./shared/ui/DeploymentNotice";
import { FinanceIntentSessionBoundary } from "./features/finance/v2/FinanceIntentSessionBoundary";

function App() {
  return (
    <ErrorBoundary fallback={() => <ErrorFallback general />}>
      <DeploymentNotice />
      <QueryProvider>
        <AuthProvider>
          <BusinessProvider><FinanceIntentSessionBoundary /><AppRouter /></BusinessProvider>
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}

export default App;
