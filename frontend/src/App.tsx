import { AppRouter } from "./app/router/AppRouter";
import { QueryProvider } from "./app/providers/QueryProvider";
import { AuthProvider } from "./features/auth/context/AuthContext";
import { BusinessProvider } from "./features/business/context/BusinessContext";

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BusinessProvider><AppRouter /></BusinessProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
