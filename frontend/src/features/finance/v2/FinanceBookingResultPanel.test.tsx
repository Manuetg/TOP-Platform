import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { FinanceBookingResultPanel } from './FinanceBookingResultPanel';
import { getFinanceBookingResult } from './finance-booking-result-api';
import type { FinanceBookingResult } from './finance-booking-result.types';
import { v2TestFixture, v2TestId } from './v2-test.fixture';
import type { FinanceV2Access } from './v2-ui.types';

const context = { businessId: 'booking-result-business', userId: 'booking-result-owner', accessToken: 'synthetic-token' };
const references = { ...v2TestFixture().references, bookings: [{ id: v2TestId, label: 'Reserva QA de septiembre' }] };
const period = { from: '2026-09-01', to: '2026-10-01' };
const asOf = '2026-10-05T12:00:00.000Z';
const access: FinanceV2Access = { role: 'OWNER', capabilities: ['finance.read'], availableSections: ['booking-result', 'booking-choices'] };
const fixture: FinanceBookingResult = { businessId: context.businessId, bookingId: v2TestId, resourceId: null, ...period, timeZone: 'America/Asuncion', asOf, currency: 'PYG', scope: 'DIRECT_BOOKING_COSTS_ONLY', token: 'a'.repeat(64), sourceLimit: 5000, sourceCount: 3, serviceRevenueMinor: 600000, terminalRevenueMinor: 50000, revenueMinor: 650000, directOperationalCostMinor: 526543, contributionMinor: 123457, contributionMarginBasisPoints: 1899, coverage: { complete: true, pendingByReason: {}, commonCostsExcluded: true, laborEstimatesExcluded: true, ownerWorkExcluded: true }, units: [], terminalEntries: [], directCostLines: [{ expenseId: v2TestId, expenseVersion: 4, lineId: v2TestId, consumedOn: '2026-09-12', amountMinor: 526543, bookingSourceUpdatedAt: null, bookingSourceStatus: null }], sourceRefs: [] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const clients: QueryClient[] = [];
function mount(currentAccess = access) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client); return render(<QueryClientProvider client={client}><MemoryRouter><FinanceBookingResultPanel context={context} access={currentAccess} references={references} period={period} asOf={asOf} active /></MemoryRouter></QueryClientProvider>); }
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

it('elige reserva explícita y muestra contribución directa, margen y líneas exactos del servidor con corte propio', async () => {
  const fetch = vi.fn().mockResolvedValue(json(fixture)); vi.stubGlobal('fetch', fetch); const user = userEvent.setup(); mount();
  expect(fetch).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText('Reserva para consultar contribución'), v2TestId);
  await screen.findByText('Cobertura directa completa');
  const panel = screen.getByRole('region', { name: 'Contribución por reserva' });
  expect(within(panel).getByText('Contribución directa').nextElementSibling).toHaveTextContent('123.457');
  expect(within(panel).getByText('Margen de contribución directa').nextElementSibling).toHaveTextContent('18,99%');
  expect(within(panel).getByText(/línea.*consumo 2026-09-12/)).toHaveTextContent('526.543');
  expect(within(panel).getByText(/no expresa la rentabilidad total/)).toBeInTheDocument();
  const request = new URL(fetch.mock.calls[0][0]); expect(request.pathname).toContain(`/finance/bookings/${v2TestId}/result`); expect(request.searchParams.get('asOf')).toBe(asOf); expect(request.searchParams.get('from')).toBe(period.from); expect(request.searchParams.get('to')).toBe(period.to);
});

it('cobertura incompleta conserva ingresos conocidos pero contribución y margen null sin concluir rentabilidad', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...fixture, contributionMinor: null, contributionMarginBasisPoints: null, coverage: { ...fixture.coverage, complete: false, pendingByReason: { SERVICE_EVIDENCE_MISSING: 2 } } })));
  const user = userEvent.setup(); mount(); await user.selectOptions(screen.getByLabelText('Reserva para consultar contribución'), v2TestId);
  await screen.findByText('Cobertura directa incompleta; contribución sin base suficiente');
  expect(screen.getByText('Sin cobertura suficiente')).toBeInTheDocument(); expect(screen.getByText('Sin base suficiente')).toBeInTheDocument(); expect(screen.getByText(/SERVICE_EVIDENCE_MISSING: 2/)).toBeInTheDocument();
});

it('token stale409 no reintenta automáticamente; consulta explícita conserva reserva y devuelve nuevo conjunto', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json(fixture)).mockResolvedValueOnce(json({ message: 'Sources changed' }, 409)).mockResolvedValueOnce(json({ ...fixture, token: 'b'.repeat(64) })); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount(); await user.selectOptions(screen.getByLabelText('Reserva para consultar contribución'), v2TestId); await screen.findByText('Cobertura directa completa');
  await user.click(screen.getByRole('button', { name: 'Verificar el mismo conjunto de fuentes' }));
  const refresh = await screen.findByRole('button', { name: 'Consultar fuentes actuales de esta reserva' }); expect(fetch).toHaveBeenCalledTimes(2); expect(new URL(fetch.mock.calls[1][0]).searchParams.get('token')).toBe(fixture.token);
  await user.click(refresh); await screen.findByText(`Token de fuentes ${'b'.repeat(64)} · 3 fuentes conservadas.`); expect(screen.getByLabelText('Reserva para consultar contribución')).toHaveValue(v2TestId); expect(new URL(fetch.mock.calls[2][0]).searchParams.has('token')).toBe(false);
});

it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'])('deny %s aun con capability: no consulta datos privados de contribución', (role) => {
  vi.stubGlobal('fetch', vi.fn()); mount({ ...access, role }); expect(screen.getByText(/todavía no está disponible/)).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});

it('rechaza DTO de otra reserva o margen sin contrato', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ ...fixture, bookingId: 'foreign-booking' })).mockResolvedValueOnce(json({ ...fixture, contributionMarginBasisPoints: undefined })));
  await expect(getFinanceBookingResult(context, v2TestId, { ...period, asOf })).rejects.toMatchObject({ name: 'ApiResponseError' });
  await expect(getFinanceBookingResult(context, v2TestId, { ...period, asOf })).rejects.toMatchObject({ name: 'ApiResponseError' });
});
