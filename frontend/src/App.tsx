import { ErrorBoundary } from "./shared/ui/ErrorBoundary";
import { ErrorFallback } from "./app/errors/ErrorFallback";
import { AppRouter } from "./app/router/AppRouter";
import { QueryProvider } from "./app/providers/QueryProvider";
import { AuthProvider } from "./features/auth/context/AuthContext";
import { BusinessProvider } from "./features/business/context/BusinessContext";

function App() {
  return (
    <ErrorBoundary fallback={() => <ErrorFallback general />}>
    <QueryProvider>
      <AuthProvider>
        <BusinessProvider><AppRouter /></BusinessProvider>
      </AuthProvider>
    </QueryProvider>
    </ErrorBoundary>
  );
}

export default App;
