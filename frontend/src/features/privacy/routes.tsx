import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";

const CookiePolicyPage = lazy(() => import("./pages/CookiePolicyPage").then((module) => ({ default: module.CookiePolicyPage })));

// Integrar en las rutas raíz, fuera de PublicRoute y ProtectedRoute, antes de "*".
export const privacyRoutes: RouteObject[] = [{
  path: "/cookies",
  element: <Suspense fallback={<p role="status">Cargando información…</p>}><CookiePolicyPage /></Suspense>,
}];
