import { test, expect, type Page, type TestInfo } from "@playwright/test";

// QA aislado: todos los datos son ficticios y cada API se intercepta antes de navegar.
const BASE_URL = process.env.TOP_HEADER_QA_BASE_URL ?? "http://127.0.0.1:4189";
const timestamp = "2026-10-02T12:00:00.000Z";
const businesses = Array.from({ length: 18 }, (_, index) => ({
  id: `qa-business-${index + 1}`,
  name: index === 0 ? "Cabañas QA Bosque" : index === 1 ? "Posada QA Río" : `Establecimiento QA ${String(index + 1).padStart(2, "0")}`,
  legalName: null, taxId: null, timezone: "America/Asuncion", currency: "PYG",
  status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp,
}));
const user = { id: "qa-user", displayName: "Operadora QA de nombre largo", email: "operadora@header.example.invalid", status: "ACTIVE" };
const resources = (businessId: string) => Array.from({ length: 24 }, (_, index) => ({
  id: `qa-resource-${index + 1}`, businessId, name: `Cabaña QA ${String(index + 1).padStart(2, "0")}`,
  internalCode: `QA${index + 1}`, description: "Alojamiento ficticio para verificar el encabezado.",
  capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status: "ACTIVE",
  sortOrder: index, createdAt: timestamp, updatedAt: timestamp, amenities: [],
}));
const searchResult = (businessId: string) => ({ groups: [
  { type: "resource", hasMore: true, items: Array.from({ length: 5 }, (_, index) => ({
    type: "resource", id: `qa-resource-${index + 1}`, title: `Cabaña QA ${String(index + 1).padStart(2, "0")}`,
    subtitle: `QA${index + 1} · 4 personas · ${businessId}`, status: "ACTIVE",
  })) },
  { type: "contact", hasMore: false, items: [{ type: "contact", id: "qa-contact-1", title: "Luz QA Fernández", subtitle: "huésped@header.example.invalid", status: "ACTIVE" }] },
  { type: "booking", hasMore: false, items: [] },
] });

type Audit = { errors: string[]; unexpected: string[]; api: string[]; geometry: unknown[]; searchMode: "results" | "empty" | "loading" | "error"; releaseSearch?: () => void };
const audits = new WeakMap<Page, Audit>();
const viewportCases = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
  { name: "small-mobile", width: 320, height: 740 },
];
const controls = ["business", "notifications", "profile", "search"] as const;
type Control = typeof controls[number];

function trigger(page: Page, control: Control) {
  const names = { business: "Cambiar negocio activo", notifications: "Notificaciones", profile: "Abrir perfil", search: "Buscar en TOP" };
  return page.getByRole(control === "search" ? "combobox" : "button", { name: names[control], exact: true }).filter({ visible: true });
}
function panel(page: Page, control: Control) {
  return page.locator(control === "search" ? ".top-global-search__panel" : ".top-header-popover").filter({ visible: true });
}
async function openControl(page: Page, control: Control) {
  const button = trigger(page, control);
  await button.click();
  if (control === "search") await button.fill("QA");
  await expect(panel(page, control)).toBeVisible();
  if (control === "search" && audits.get(page)?.searchMode === "results") {
    await expect(page.getByRole("option", { name: /Cabaña QA 01/ })).toBeVisible();
  }
  return button;
}
async function verifyGeometry(page: Page, control: Control, note: string) {
  const entry = await panel(page, control).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const bounds = { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? innerWidth, height: viewport?.height ?? innerHeight, scale: viewport?.scale ?? 1 };
    const hit = document.elementFromPoint(Math.min(rect.right - 8, rect.left + rect.width / 2), Math.min(rect.bottom - 8, rect.top + rect.height / 2));
    return { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      bounds, hitWithin: !!hit && element.contains(hit), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      parentTag: element.parentElement?.tagName, overflow: getComputedStyle(element).overflowY };
  });
  const buttonRect = await (control === "search" ? trigger(page, control).locator("..") : trigger(page, control)).boundingBox();
  audits.get(page)!.geometry.push({ control, note, ...entry, trigger: buttonRect });
  expect(entry.rect.width, `${note}: ancho del panel`).toBeGreaterThan(100);
  expect(entry.rect.height, `${note}: alto del panel`).toBeGreaterThan(40);
  expect(entry.rect.left, `${note}: borde izquierdo`).toBeGreaterThanOrEqual(entry.bounds.left - 1);
  expect(entry.rect.top, `${note}: borde superior`).toBeGreaterThanOrEqual(entry.bounds.top - 1);
  expect(entry.rect.right, `${note}: borde derecho`).toBeLessThanOrEqual(entry.bounds.left + entry.bounds.width + 1);
  expect(entry.rect.bottom, `${note}: borde inferior`).toBeLessThanOrEqual(entry.bounds.top + entry.bounds.height + 1);
  expect(entry.hitWithin, `${note}: panel no recortado ni tapado`).toBe(true);
  if (buttonRect && buttonRect.x + buttonRect.width > entry.bounds.left && buttonRect.x < entry.bounds.left + entry.bounds.width && buttonRect.y >= entry.bounds.top && buttonRect.y + buttonRect.height < entry.bounds.top + entry.bounds.height) {
    expect(entry.rect.right).toBeGreaterThan(buttonRect.x);
    expect(entry.rect.left).toBeLessThan(buttonRect.x + buttonRect.width);
    if (entry.bounds.height - buttonRect.y - buttonRect.height > entry.rect.height + 20) {
      expect(entry.rect.top, `${note}: anclaje debajo del control`).toBeGreaterThanOrEqual(buttonRect.y + buttonRect.height - 1);
      expect(entry.rect.top, `${note}: separación del control`).toBeLessThanOrEqual(buttonRect.y + buttonRect.height + 20);
    }
  }
}
async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeEach(async ({ page, context }) => {
  const audit: Audit = { errors: [], unexpected: [], api: [], geometry: [], searchMode: "results" };
  audits.set(page, audit);
  page.on("pageerror", (error) => audit.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") audit.errors.push(message.text()); });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE_URL) { audit.unexpected.push(url.origin + url.pathname); await route.abort("blockedbyclient"); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    audit.api.push(`${route.request().method()} ${url.pathname}${url.search}`);
    const json = async (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/api/auth/refresh") { await json({ accessToken: "synthetic-access-token", refreshToken: "synthetic-refresh-token", tokenType: "Bearer", expiresIn: 3600 }); return; }
    if (url.pathname === "/api/auth/logout") { await route.fulfill({ status: 204 }); return; }
    if (url.pathname === "/api/businesses") { await json(businesses); return; }
    const tenantPath = url.pathname.match(/^\/api\/businesses\/(qa-business-\d+)(\/.*)$/);
    if (tenantPath) {
      const [, businessId, suffix] = tenantPath;
      if (suffix === "/search") {
        if (audit.searchMode === "loading") await new Promise<void>((resolve) => {
          // Toda demora ficticia se libera también al fallar una assertion o cerrar la página.
          const timer = setTimeout(resolve, 5000);
          audit.releaseSearch = () => { clearTimeout(timer); resolve(); };
        });
        if (audit.searchMode === "error") { await json({ message: "Error QA simulado" }, 503); return; }
        await json(audit.searchMode === "empty" ? { groups: [{ type: "resource", hasMore: false, items: [] }, { type: "contact", hasMore: false, items: [] }, { type: "booking", hasMore: false, items: [] }] } : searchResult(businessId)); return;
      }
      if (["/resources/images/covers", "/rate-plans", "/amenities", "/bookings", "/blocks"].includes(suffix)) { await json([]); return; }
      if (suffix === "/resources") { await json(resources(businessId)); return; }
      if (suffix === "/resources/qa-resource-1") { await json(resources(businessId)[0]); return; }
      if (suffix === "/resources/qa-resource-1/images") { await json([]); return; }
      if (suffix === "/dashboard") { await json({ occupancy: { occupiedResourceNights: 0, sellableResourceNights: 744, occupancyRateBasisPoints: 0 }, revenue: { currency: "PYG", amountMinor: 0 }, reservations: { total: 0, byStatus: { DRAFT: 0, PENDING: 0, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 } } }); return; }
    }
    audit.unexpected.push(`API no prevista: ${url.pathname}`);
    await json({ message: "Request bloqueada por QA aislado" }, 501);
  });
  await context.addInitScript(({ baseUrl, qaUser, qaBusinesses }) => {
    if (location.origin !== baseUrl) return;
    sessionStorage.setItem("top.auth.session.v1", JSON.stringify({ refreshToken: "synthetic-refresh-token", user: qaUser,
      memberships: qaBusinesses.map((business) => ({ businessId: business.id, role: "OWNER" })), mode: "SESSION" }));
  }, { baseUrl: BASE_URL, qaUser: user, qaBusinesses: businesses });
  await page.goto(`${BASE_URL}/app/resources`);
  await page.getByRole("button", { name: businesses[0].name, exact: true }).click();
  await expect(trigger(page, "business")).toContainText(businesses[0].name);
  await expect(page.locator("#top-main-content")).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  const audit = audits.get(page)!;
  audit.releaseSearch?.();
  await testInfo.attach("auditoria-sintetica", { body: JSON.stringify({ baseUrl: BASE_URL, browserZoomLimit: "CSS zoom y CDP pinch no equivalen a zoom nativo del navegador", ...audit, releaseSearch: undefined }, null, 2), contentType: "application/json" });
  expect(audit.unexpected, "Ninguna API real ni request externa permitida").toEqual([]);
  const unexpectedErrors = audit.errors.filter((entry) => !entry.includes("503 (Service Unavailable)"));
  expect(unexpectedErrors, "Sin errores de consola ni JavaScript inesperados").toEqual([]);
});

for (const viewport of viewportCases) {
  test(`cuatro controles anclados y accesibles ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const control of controls) {
      const button = await openControl(page, control);
      await verifyGeometry(page, control, viewport.name);
      await capture(page, testInfo, `${viewport.name}-${control}`);
      await page.keyboard.press("Escape");
      await expect(panel(page, control)).toHaveCount(0);
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute("aria-expanded", "false");
    }
  });
}

test("barra lateral, scroll largo y contenedores con overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Contraer barra lateral" }).click();
  await openControl(page, "business");
  await verifyGeometry(page, "business", "sidebar contraída");
  const businessPanel = panel(page, "business");
  await expect(businessPanel.getByRole("button", { name: businesses[17].name, exact: true })).toBeAttached();
  const lastBusiness = businessPanel.getByRole("button", { name: businesses[17].name, exact: true });
  await lastBusiness.scrollIntoViewIfNeeded();
  await expect(lastBusiness).toBeInViewport();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#top-main-content")!.style.minHeight = "3000px";
    document.querySelectorAll<HTMLElement>(".top-global-header, .top-mobile-header").forEach((element) => { element.style.overflow = "hidden"; });
    window.scrollTo(0, 900);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  for (const control of controls) {
    await openControl(page, control);
    await verifyGeometry(page, control, "scroll y overflow de header");
    await page.keyboard.press("Escape");
  }
});

test("cambia entre desktop y móvil con panel abierto", async ({ page }) => {
  for (const control of controls) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openControl(page, control);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => panel(page, control).count()).toBe(0);
    await expect(page.locator("#top-main-content")).toBeFocused();
    await openControl(page, control);
    await verifyGeometry(page, control, "desktop a móvil");
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(async () => panel(page, control).count()).toBe(0);
    await expect(page.locator("#top-main-content")).toBeFocused();
  }
});

test("cambio de breakpoint desde reintento devuelve foco al contenido", async ({ page }) => {
  audits.get(page)!.searchMode = "error";
  await page.setViewportSize({ width: 1440, height: 900 });
  await openControl(page, "search");
  const retry = page.getByRole("button", { name: "Reintentar búsqueda" });
  await expect(retry).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel(page, "search")).toHaveCount(0);
  await expect(page.locator("#top-main-content")).toBeFocused();
});

test("exclusión mutua, clic fuera y Tab sin perder controles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const control of controls) {
    await openControl(page, control);
    const other = control === "profile" ? "notifications" : "profile";
    await openControl(page, other);
    await expect(page.locator(".top-header-popover:visible, .top-global-search__panel:visible")).toHaveCount(1);
    await page.locator("#top-main-content").click({ position: { x: 20, y: 20 } });
    await expect(page.locator(".top-header-popover:visible, .top-global-search__panel:visible")).toHaveCount(0);
  }
  const button = await openControl(page, "profile");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => !!document.activeElement && document.activeElement !== document.body)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  const input = await openControl(page, "search");
  await page.keyboard.press("Tab");
  await expect(input).not.toBeFocused();
  await expect(input).toHaveAttribute("aria-expanded", "false");
});

test("búsqueda cotidiana con carga, vacío, error y reintento por teclado", async ({ page }, testInfo) => {
  const audit = audits.get(page)!;
  const input = trigger(page, "search");
  await input.click();
  await expect(panel(page, "search")).not.toContainText(/módulos|entidades|UID completo|UUID completo/i);
  await expect.poll(() => audit.api.filter((entry) => entry.includes("/search")).length).toBe(0);
  await input.fill("Q");
  await expect(page.getByRole("status").filter({ hasText: /al menos 2/ })).toBeVisible();
  audit.searchMode = "loading";
  await input.fill("QA");
  await expect(panel(page, "search").getByRole("status")).toHaveText(/Buscando/);
  await capture(page, testInfo, "desktop-search-loading");
  audit.searchMode = "empty";
  audit.releaseSearch?.();
  await expect(panel(page, "search")).toContainText("Sin resultados");
  await capture(page, testInfo, "desktop-search-empty");
  audit.searchMode = "error";
  await input.fill("QA error");
  const retry = page.getByRole("button", { name: "Reintentar búsqueda" });
  await expect(retry).toBeVisible();
  await capture(page, testInfo, "desktop-search-error");
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  audit.searchMode = "results";
  await page.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await expect(page.getByRole("option", { name: /Cabaña QA 01/ })).toBeVisible();
  await expect(panel(page, "search")).not.toContainText(/módulos|entidades|UID completo|UUID completo/i);
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/app\/resources\/qa-resource-1$/);
  await expect(page.getByRole("heading", { name: "Cabaña QA 01", exact: true })).toBeVisible();
  await expect(page.locator("#top-main-content")).toBeFocused();
});

test("cambio de negocio cancela búsqueda tardía y cambia su scope", async ({ page }) => {
  const audit = audits.get(page)!;
  audit.searchMode = "loading";
  await openControl(page, "search");
  await expect(panel(page, "search").getByRole("status")).toHaveText(/Buscando/);
  await openControl(page, "business");
  await panel(page, "business").getByRole("button", { name: businesses[1].name, exact: true }).click();
  await expect(trigger(page, "business")).toContainText(businesses[1].name);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Operadora");
  await expect(page.locator("#top-main-content")).toBeFocused();
  audit.searchMode = "results";
  audit.releaseSearch?.();
  await expect(trigger(page, "search")).toHaveValue("");
  await openControl(page, "search");
  await expect(page.getByRole("option", { name: /Cabaña QA 01/ })).toContainText(businesses[1].id);
  await expect.poll(() => audit.api.some((entry) => entry.includes(`/businesses/${businesses[1].id}/search`))).toBe(true);
});

test("zoom CSS 200 por ciento mantiene los cuatro paneles en viewport", async ({ page }, testInfo) => {
  // 2880 físicos con CSS zoom 2 dejan espacio lógico desktop; no equivalen a Ctrl+zoom.
  await page.setViewportSize({ width: 2880, height: 1800 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  for (const control of controls) {
    await openControl(page, control);
    await verifyGeometry(page, control, "CSS zoom 200% (no zoom nativo)");
    await capture(page, testInfo, `wide-css-zoom-200-${control}`);
    await page.keyboard.press("Escape");
  }
});

test.describe("reflow equivalente a página ampliada", () => {
  test.use({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
  test("reflow equivalente 720 por 450 con DPR dos conserva clic y foco", async ({ page }, testInfo) => {
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))).toEqual({ width: 720, height: 450, dpr: 2 });
    for (const control of controls) {
      const button = await openControl(page, control);
      await verifyGeometry(page, control, "reflow CSS 720×450, DPR 2 (no zoom nativo)");
      await capture(page, testInfo, `reflow-720-dpr-2-${control}`);
      await page.keyboard.press("Escape");
      await expect(panel(page, control)).toHaveCount(0);
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute("aria-expanded", "false");
    }
  });
});

test("visualViewport ampliado con CDP recalcula límites", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  for (const control of controls) {
    // CDP pinch cambia las coordenadas visuales: se prueba geometría sin simular tapping.
    await trigger(page, control).dispatchEvent("click");
    if (control === "search") {
      await trigger(page, control).focus();
      await trigger(page, control).fill("QA");
    }
    await expect(panel(page, control)).toBeVisible();
    await verifyGeometry(page, control, "CDP pinch 200% (no zoom nativo)");
    await capture(page, testInfo, `visual-viewport-200-${control}`);
    await page.keyboard.press("Escape");
  }
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await cdp.detach();
});

test("los bordes inferiores y derechos invierten y limitan el panel", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const control of controls) {
    const button = trigger(page, control);
    await button.evaluate((element, kind) => {
      const anchor = kind === "search" ? element.closest("label") as HTMLElement : element as HTMLElement;
      anchor.style.position = "fixed";
      anchor.style.width = kind === "search" ? "180px" : "110px";
      anchor.style.height = "44px";
      anchor.style.left = `${window.innerWidth - (kind === "search" ? 182 : 112)}px`;
      anchor.style.top = `${window.innerHeight - 50}px`;
      anchor.style.zIndex = "100";
    }, control);
    await openControl(page, control);
    await verifyGeometry(page, control, "borde inferior derecho");
    const buttonBounds = await button.boundingBox();
    const panelBounds = await panel(page, control).boundingBox();
    expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(buttonBounds!.y + 1);
    await capture(page, testInfo, `bottom-right-${control}`);
    await page.keyboard.press("Escape");
    await button.evaluate((element, kind) => {
      const anchor = kind === "search" ? element.closest("label") as HTMLElement : element as HTMLElement;
      anchor.removeAttribute("style");
    }, control);
  }
});
