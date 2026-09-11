import {
  Navigate,
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { LoginPage } from "../../features/auth/pages/LoginPage";
import { AppLayout } from "../layout/AppLayout";
import { AppSectionPage } from "../pages/AppSectionPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ResourceListPage } from "../../features/resources/pages/ResourceListPage";
import { ResourceDetailPage } from "../../features/resources/pages/ResourceDetailPage";
import { CreateResourcePage } from "../../features/resources/pages/CreateResourcePage";
import { EditResourcePage } from "../../features/resources/pages/EditResourcePage";
import { ContactListPage } from "../../features/contacts/pages/ContactListPage";
import { CreateContactPage } from "../../features/contacts/pages/CreateContactPage";
import { ContactDetailPage } from "../../features/contacts/pages/ContactDetailPage";
import { EditContactPage } from "../../features/contacts/pages/EditContactPage";
import { AvailabilityCheckPage } from "../../features/availability/pages/AvailabilityCheckPage";
import { AvailabilityRulesPage } from "../../features/availability/pages/AvailabilityRulesPage";
import { BlockListPage } from "../../features/blocks/pages/BlockListPage";
import { CreateBlockPage } from "../../features/blocks/pages/CreateBlockPage";

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
        element: <AvailabilityCheckPage />,
      },
      {
        path: "availability/rules",
        element: <AvailabilityRulesPage />,
      },
      {
        path: "resources",
        element: <ResourceListPage />,
      },
      {
        path: "resources/new",
        element: <CreateResourcePage />,
      },
      {
        path: "resources/:resourceId/edit",
        element: <EditResourcePage />,
      },
      {
        path: "resources/:resourceId",
        element: <ResourceDetailPage />,
      },
      {
        path: "contacts",
        element: <ContactListPage />,
      },
      {
        path: "contacts/new",
        element: <CreateContactPage />,
      },
      {
        path: "contacts/:contactId/edit",
        element: <EditContactPage />,
      },
      {
        path: "contacts/:contactId",
        element: <ContactDetailPage />,
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
        element: <BlockListPage />,
      },
      {
        path: "blocks/new",
        element: <CreateBlockPage />,
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
