import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FinanceV2Bridge, type FinanceV2BridgeProps } from './FinanceV2Bridge';
import { v2TestFixture } from './v2-test.fixture';
import type { FinanceV2WorkspaceProps } from './v2-ui.types';
vi.mock('./FinanceV2Workspace', () => ({ FinanceV2Workspace: ({ references }: FinanceV2WorkspaceProps) => <div aria-label="Reservas disponibles">{references.bookings.map((booking) => <span key={booking.id}>{booking.label}</span>)}</div> }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });
function props(): FinanceV2BridgeProps { return { context: { userId: 'owner-a', businessId: 'synthetic-a', accessToken: 'synthetic-token' }, businessName: 'Posada sintética', role: 'OWNER', configuration: { capabilities: ['finance.read', 'booking.read'], availableSections: ['booking-choices'] }, report: v2TestFixture().references.report, period: { from: '2026-09-01', to: '2026-10-01' }, view: 'results', active: true }; }
function mount(input = props()) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client); render(<QueryClientProvider client={client}><FinanceV2Bridge {...input}/></QueryClientProvider>); }
it('booking.read real habilita selección de reservas del mismo negocio', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 'booking-a', businessId: 'synthetic-a', checkInDate: '2026-09-29', checkOutDate: '2026-10-01', status: 'CONFIRMED' }]))); vi.stubGlobal('fetch', fetch);
  mount(); expect(await screen.findByText(/booking-a/)).toBeVisible();
  expect(fetch).toHaveBeenCalledOnce(); expect(String(fetch.mock.calls[0][0])).toContain('/businesses/synthetic-a/bookings');
});
it.each(['bookings.read', 'other'])('capability %s conserva default-deny de reservas', (capability) => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const input = props(); input.configuration.capabilities = ['finance.read', capability]; mount(input);
  expect(screen.getByLabelText('Reservas disponibles')).toBeEmptyDOMElement(); expect(fetch).not.toHaveBeenCalled();
});
it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'])('%s no consulta reservas desde las vistas privadas V2', (role) => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); mount({ ...props(), role }); expect(fetch).not.toHaveBeenCalled();
});
it('vista inactiva no consulta reservas aunque la capacidad y sección estén habilitadas', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); mount({ ...props(), active: false }); expect(fetch).not.toHaveBeenCalled();
});
