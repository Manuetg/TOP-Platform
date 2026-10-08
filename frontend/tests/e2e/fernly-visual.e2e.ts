import { test, expect } from "@playwright/test";
import { financeFixture } from "../../src/features/finance/pages/finance.fixture";

const baseURL = process.env.TOP_FERNLY_QA_BASE_URL ?? "http://127.0.0.1:4197";
const timestamp = "2026-10-07T12:00:00.000Z";
const business = { id: "qa-business-fernly", name: "Cabañas QA Bosque", legalName: null, taxId: null, timezone: "America/Asuncion", currency: "PYG", status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
const user = { id: "qa-user-fernly", displayName: "Operadora QA", email: "operadora@fernly.example.invalid", status: "ACTIVE" };
const resource = { id: "qa-resource", businessId: business.id, name: "Cabaña QA Lapacho", internalCode: "QA01", description: "Unidad sintética para la muestra visual.", capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status: "ACTIVE", sortOrder: 0, amenities: [], createdAt: timestamp, updatedAt: timestamp };
const contact = { id: "qa-contact", businessId: business.id, name: "Luz QA", lastName: "Fernández", fullName: "Luz QA Fernández", phone: null, whatsapp: null, email: "huesped@fernly.example.invalid", documentType: null, documentNumber: null, country: "PY", city: "Asunción", status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp };
const booking = { id: "qa-booking", businessId: business.id, status: "PENDING", contactId: contact.id, resourceIds: [resource.id], checkInDate: "2026-10-12", checkOutDate: "2026-10-14", adults: 2, children: 0, notes: "Reserva sintética", createdAt: timestamp, updatedAt: timestamp };
const pricedBooking = { ...booking, id: "qa-priced-booking", status: "CONFIRMED", financialSummary: { totalAmountMinor: 450000, paidAmountMinor: 150000, outstandingAmountMinor: 300000, financialVersion: 1, currency: "PYG" } };

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 320, height: 844 }]) {
  test(`muestra de paridad visual ${viewport.width}x${viewport.height}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      const expectedMissingPlan = message.location().url.includes("/payment-plan") && message.text().includes("404");
      if (message.type() === "error" && !expectedMissingPlan) errors.push(message.text());
    });
    // Ninguna mutation operativa ni request externa sale del navegador.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const json = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/auth/refresh") return json({ accessToken: "synthetic-access-token", refreshToken: "synthetic-refresh-token", tokenType: "Bearer", expiresIn: 3600 });
        if (route.request().method() !== "GET") { unexpected.push(`Mutation bloqueada: ${url.pathname}`); return route.abort(); }
        if (url.pathname === "/api/businesses") return json([business]);
        if (url.pathname === `/api/users/${user.id}/profile`) return json({ ...user, birthYear: null, username: null, phone: null, avatarId: "leaf", updatedAt: timestamp });
        const suffix = url.pathname.replace(`/api/businesses/${business.id}`, "");
        if (suffix === "/resources") return json([resource]);
        if (["/resources/images/covers", "/rate-plans", "/blocks", "/amenities"].includes(suffix)) return json([]);
        if (suffix === "/contacts") return json([contact]);
        if (suffix === `/contacts/${contact.id}`) return json(contact);
        if (suffix === "/bookings") return json([booking, pricedBooking]);
        if (suffix === `/bookings/${booking.id}`) return json(booking);
        if (suffix === `/bookings/${pricedBooking.id}`) return json(pricedBooking);
        if (suffix.endsWith("/timeline")) return json({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } });
        if (suffix.endsWith("/outstanding-balance")) return json({ bookingId: pricedBooking.id, currency: "PYG", totalAmountMinor: 450000, paidAmountMinor: 150000, outstandingAmountMinor: 300000, creditAmountMinor: 0, needsReconciliation: false, warning: null, overdueAmountMinor: null, financialStatus: "PARTIALLY_PAID", nextDueDate: null, nextDueAmountMinor: null });
        if (suffix.endsWith("/payment-plan")) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Sin plan sintético" }) });
        if (suffix.endsWith("/payments")) return json({ items: [{ id: "qa-payment", bookingId: pricedBooking.id, amountMinor: 150000, currency: "PYG", method: "CASH", reference: "QA", note: null, paidAt: timestamp, createdAt: timestamp, recordedByUserId: user.id, status: "RECORDED" }], pageInfo: { hasNextPage: false, nextCursor: null } });
        if (suffix === "/availability/calendar") {
          const from = url.searchParams.get("from")!;
          const to = url.searchParams.get("to")!;
          const days = [];
          for (let day = from; day < to; day = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) days.push({ date: day, status: "AVAILABLE", reasons: [] });
          return json({ from, to, resources: [{ resourceId: resource.id, days }] });
        }
        if (suffix === "/dashboard") return json({ occupancy: { occupiedResourceNights: 12, sellableResourceNights: 31, occupancyRateBasisPoints: 3871 }, revenue: { currency: "PYG", amountMinor: 450000 }, reservations: { total: 2, byStatus: { DRAFT: 0, PENDING: 1, CONFIRMED: 1, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 } } });
        if (suffix === "/finance") return json({ ...financeFixture(business.id), from: url.searchParams.get("from"), to: url.searchParams.get("to") });
        unexpected.push(`API no prevista: ${url.pathname}`);
        return route.fulfill({ status: 501, body: "Request bloqueada por QA sintético" });
      }
      if (url.origin === baseURL) return route.continue();
      unexpected.push(`Origen bloqueado: ${url.origin}`);
      return route.abort();
    });
    await context.addInitScript(({ origin, qaUser, businessId }) => {
      if (location.origin !== origin) return;
      sessionStorage.setItem("top.auth.session.v1", JSON.stringify({ refreshToken: "synthetic-refresh-token", user: qaUser, memberships: [{ businessId, role: "OWNER" }], mode: "SESSION" }));
    }, { origin: baseURL, qaUser: user, businessId: business.id });

    const capture = async (name: string) => {
      await expect(page.locator("#top-main-content")).toBeVisible();
      const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      const path = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ path, fullPage: false, animations: "disabled" });
      await testInfo.attach(name, { path, contentType: "image/png" });
      if (width.document > width.viewport + 1) {
        const overflow = await page.evaluate(() => Array.from(document.querySelectorAll("body *"))
          .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
          .map((element) => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right }))
          .slice(0, 25));
        await testInfo.attach(`${name}-overflow`, { body: JSON.stringify({ ...width, overflow }), contentType: "application/json" });
      }
      expect(width.document, `${name}: sin overflow del documento`).toBeLessThanOrEqual(width.viewport + 1);
    };
    await page.goto(`${baseURL}/app`);
    await expect(page.getByRole("heading", { name: /Buenos|Buenas|Hola|Inicio|operación/i }).first()).toBeVisible();
    await expect(page.locator(".dashboard-kpi-strip")).toBeVisible();
    await expect(page.getByRole("article", { name: "Ingresos", exact: true })).toContainText("₲ 450.000");
    await capture("dashboard");
    await page.goto(`${baseURL}/app/calendar`);
    await expect(page.getByRole("button", { name: /Nueva reserva/i }).first()).toBeVisible();
    await capture("calendar");
    await page.goto(`${baseURL}/app/contacts/new`);
    await page.getByLabel("Nombre *", { exact: true }).fill("Borrador QA");
    await page.getByLabel("Apellido *", { exact: true }).fill("Fernández");
    // El panel del shell conserva el mismo formulario y su borrador.
    await page.getByRole("button", { name: "Abrir perfil" }).filter({ visible: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Nombre *", { exact: true })).toHaveValue("Borrador QA");
    await capture("contact-form");
    await page.goto(`${baseURL}/app/contacts/${contact.id}`);
    const archive = page.getByRole("button", { name: /Archivar/ }).first();
    await archive.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#root")).toHaveAttribute("inert", "");
    await capture("confirm-dialog");
    await page.keyboard.press("Escape");
    await expect(archive).toBeFocused();
    await page.goto(`${baseURL}/app/bookings/${booking.id}/confirm`);
    await page.getByRole("button", { name: "Manual", exact: true }).click();
    await expect(page.getByLabel("Precio final", { exact: true })).toBeVisible();
    await capture("booking-pricing");
    await page.goto(`${baseURL}/app/bookings/${pricedBooking.id}/payments`);
    await expect(page.getByText("₲ 300.000", { exact: true }).first()).toBeVisible();
    await capture("payments");
    await page.goto(`${baseURL}/app/finance?from=2026-09-01&to=2026-10-01`);
    await expect(page.getByRole("button", { name: "Exportar este reporte" })).toBeVisible();
    await capture("finance");
    await expect(page.getByRole("navigation", { name: "Vistas de Finanzas" }).getByRole("button")).toHaveCount(10);
    if (viewport.width === 1440) {
      // Proxy de reflow CSS al 200%; no equivale al zoom nativo del navegador.
      await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      const searchWidth = await page.locator(".top-global-header__search-wrap").getByRole("combobox", { name: "Buscar en TOP" }).evaluate((element) => element.getBoundingClientRect().width);
      expect(searchWidth).toBeGreaterThanOrEqual(88);
      await capture("finance-reflow-css-200");
      await page.getByRole("navigation", { name: "Vistas de Finanzas" }).getByRole("button", { name: "Cobros", exact: true }).click();
      await expect(page.locator(".finance-payment-amounts").first()).toBeVisible();
      const clippedAmounts = await page.locator(".finance-payment-amounts, .finance-payment-amounts > div")
        .evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).length);
      expect(clippedAmounts, "Etiquetas e importes de Cobros sin recorte interno").toBe(0);
      await capture("finance-payments-reflow-css-200");
      await page.evaluate(() => { document.documentElement.style.zoom = ""; });
    }
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach("alcance", { body: JSON.stringify({ viewport, head: process.env.TOP_FERNLY_QA_HEAD ?? "working-tree", transport: "SYNTHETIC_ONLY_NOT_API_INTEGRATION", screenshots: viewport.width === 1440 ? 9 : 7, nativeZoom: "NOT_RUN", unexpected, errors }), contentType: "application/json" });
  });
}
