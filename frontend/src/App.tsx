import { AppRouter } from "./app/router/AppRouter";
import { QueryProvider } from "./app/providers/QueryProvider";

function App() {
  return (
    <QueryProvider>
      <AppRouter />
    </QueryProvider>
  );
}

export default App;
