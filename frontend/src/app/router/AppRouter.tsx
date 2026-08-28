import {
  Navigate,
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { AppLayout } from "../layout/AppLayout";
import { AppSectionPage } from "../pages/AppSectionPage";
import { NotFoundPage } from "../pages/NotFoundPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/app",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <AppSectionPage title="Inicio" />,
      },
      {
        path: "calendar",
        element: <AppSectionPage title="Calendario" />,
      },
      {
        path: "bookings",
        element: <AppSectionPage title="Reservas" />,
      },
      {
        path: "availability",
        element: <AppSectionPage title="Disponibilidad" />,
      },
      {
        path: "resources",
        element: <AppSectionPage title="Recursos" />,
      },
      {
        path: "contacts",
        element: <AppSectionPage title="Contactos" />,
      },
      {
        path: "pricing",
        element: <AppSectionPage title="Precios" />,
      },
      {
        path: "payments",
        element: <AppSectionPage title="Pagos" />,
      },
      {
        path: "blocks",
        element: <AppSectionPage title="Bloqueos" />,
      },
      {
        path: "settings",
        element: <AppSectionPage title="Configuración" />,
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
