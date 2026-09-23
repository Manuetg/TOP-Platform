import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
const LoginPage = lazy(() => import("../../features/auth/pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import("../../features/dashboard/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
import { AppLayout } from "../layout/AppLayout";
const BusinessProfilePage = lazy(() => import("../../features/business/pages/BusinessProfilePage").then((module) => ({ default: module.BusinessProfilePage })));
import { NotFoundPage } from "../pages/NotFoundPage";
const ResourceListPage = lazy(() => import("../../features/resources/pages/ResourceListPage").then((module) => ({ default: module.ResourceListPage })));
const ResourceDetailPage = lazy(() => import("../../features/resources/pages/ResourceDetailPage").then((module) => ({ default: module.ResourceDetailPage })));
const CreateResourcePage = lazy(() => import("../../features/resources/pages/CreateResourcePage").then((module) => ({ default: module.CreateResourcePage })));
const EditResourcePage = lazy(() => import("../../features/resources/pages/EditResourcePage").then((module) => ({ default: module.EditResourcePage })));
const ContactListPage = lazy(() => import("../../features/contacts/pages/ContactListPage").then((module) => ({ default: module.ContactListPage })));
const CreateContactPage = lazy(() => import("../../features/contacts/pages/CreateContactPage").then((module) => ({ default: module.CreateContactPage })));
const ContactDetailPage = lazy(() => import("../../features/contacts/pages/ContactDetailPage").then((module) => ({ default: module.ContactDetailPage })));
const EditContactPage = lazy(() => import("../../features/contacts/pages/EditContactPage").then((module) => ({ default: module.EditContactPage })));
const AvailabilityCheckPage = lazy(() => import("../../features/availability/pages/AvailabilityCheckPage").then((module) => ({ default: module.AvailabilityCheckPage })));
const AvailabilityRulesPage = lazy(() => import("../../features/availability/pages/AvailabilityRulesPage").then((module) => ({ default: module.AvailabilityRulesPage })));
const AvailabilityCalendarPage = lazy(() => import("../../features/availability/pages/AvailabilityCalendarPage").then((module) => ({ default: module.AvailabilityCalendarPage })));
const BlockListPage = lazy(() => import("../../features/blocks/pages/BlockListPage").then((module) => ({ default: module.BlockListPage })));
const BookingListPage = lazy(() => import("../../features/bookings/pages/BookingListPage").then((module) => ({ default: module.BookingListPage })));
const BookingDetailPage = lazy(() => import("../../features/bookings/pages/BookingDetailPage").then((module) => ({ default: module.BookingDetailPage })));
const CreateBookingPage = lazy(() => import("../../features/bookings/pages/CreateBookingPage").then((module) => ({ default: module.CreateBookingPage })));
const EditBookingPage = lazy(() => import("../../features/bookings/pages/EditBookingPage").then((module) => ({ default: module.EditBookingPage })));
const ConfirmBookingPage = lazy(() => import("../../features/bookings/pages/ConfirmBookingPage").then((module) => ({ default: module.ConfirmBookingPage })));
const CreateBlockPage = lazy(() => import("../../features/blocks/pages/CreateBlockPage").then((module) => ({ default: module.CreateBlockPage })));
const RatePlanListPage = lazy(() => import("../../features/pricing/pages/RatePlanListPage").then((module) => ({ default: module.RatePlanListPage })));
const CreateRatePlanPage = lazy(() => import("../../features/pricing/pages/CreateRatePlanPage").then((module) => ({ default: module.CreateRatePlanPage })));
const EditRatePlanPage = lazy(() => import("../../features/pricing/pages/EditRatePlanPage").then((module) => ({ default: module.EditRatePlanPage })));
const SeasonalRatesPage = lazy(() => import("../../features/pricing/pages/SeasonalRatesPage").then((module) => ({ default: module.SeasonalRatesPage })));
const PricePreviewPage = lazy(() => import("../../features/pricing/pages/PricePreviewPage").then((module) => ({ default: module.PricePreviewPage })));
const PaymentHubPage = lazy(() => import("../../features/payments/pages/PaymentHubPage").then((module) => ({ default: module.PaymentHubPage })));
const BookingPaymentsPage = lazy(() => import("../../features/payments/pages/BookingPaymentsPage").then((module) => ({ default: module.BookingPaymentsPage })));
import { ProtectedRoute, PublicRoute } from "./ProtectedRoute";

import { ErrorFallback } from "../errors/ErrorFallback";

function page(Component: ComponentType) { return <Suspense fallback={<p role="status" aria-live="polite">Cargando pantalla…</p>}><Component /></Suspense>; }

export const appRoutes: RouteObject[] = [{ errorElement: <ErrorFallback general />, children: [
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    element: <PublicRoute />,
    children: [{ index: true, element: page(LoginPage) }],
  },
  {
    path: "/app",
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      {
        index: true,
        element: page(DashboardPage),
      },
      {
        path: "calendar",
        element: page(AvailabilityCalendarPage),
      },
      {
        path: "bookings",
        element: page(BookingListPage),
      },
      {
        path: "bookings/new",
        element: page(CreateBookingPage),
      },
      {
        path: "bookings/:bookingId",
        element: page(BookingDetailPage),
      },
      {
        path: "bookings/:bookingId/payments",
        element: page(BookingPaymentsPage),
      },
      {
        path: "bookings/:bookingId/edit",
        element: page(EditBookingPage),
      },
      {
        path: "bookings/:bookingId/confirm",
        element: page(ConfirmBookingPage),
      },
      {
        path: "availability",
        element: page(AvailabilityCheckPage),
      },
      {
        path: "availability/rules",
        element: page(AvailabilityRulesPage),
      },
      {
        path: "resources",
        element: page(ResourceListPage),
      },
      {
        path: "resources/new",
        element: page(CreateResourcePage),
      },
      {
        path: "resources/:resourceId/edit",
        element: page(EditResourcePage),
      },
      {
        path: "resources/:resourceId",
        element: page(ResourceDetailPage),
      },
      {
        path: "contacts",
        element: page(ContactListPage),
      },
      {
        path: "contacts/new",
        element: page(CreateContactPage),
      },
      {
        path: "contacts/:contactId/edit",
        element: page(EditContactPage),
      },
      {
        path: "contacts/:contactId",
        element: page(ContactDetailPage),
      },
      {
        path: "pricing",
        element: page(RatePlanListPage),
      },
      {
        path: "pricing/new",
        element: page(CreateRatePlanPage),
      },
      {
        path: "pricing/:ratePlanId/edit",
        element: page(EditRatePlanPage),
      },
      {
        path: "pricing/:ratePlanId/seasons",
        element: page(SeasonalRatesPage),
      },
      {
        path: "pricing/:ratePlanId/preview",
        element: page(PricePreviewPage),
      },
      {
        path: "payments",
        element: page(PaymentHubPage),
      },
      {
        path: "blocks",
        element: page(BlockListPage),
      },
      {
        path: "blocks/new",
        element: page(CreateBlockPage),
      },
      {
        path: "settings",
        element: page(BusinessProfilePage),
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
] }];
