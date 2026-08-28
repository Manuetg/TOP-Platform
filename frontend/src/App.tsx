import { AppRouter } from "./app/router/AppRouter";
import { QueryProvider } from "./app/providers/QueryProvider";
import { AuthProvider } from "./features/auth/context/AuthContext";

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
