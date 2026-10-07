import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { formatMoney } from '../../../shared/utils/money';
import { FinancePlanningScenario } from './FinancePlanningScenario';
import type { FinanceCashProjection, FinanceCashProjectionInput } from './finance-v2.types';
import { v2TestFixture } from './v2-test.fixture';
import type { FinanceV2Access } from './v2-ui.types';

const context = { businessId: 'synthetic-a', userId: 'planning-sources-owner', accessToken: 'planning-old-token' };
const access: FinanceV2Access = { role: 'OWNER', capabilities: ['finance.read', 'finance.planning'], availableSections: ['planning-preview'] };
const payableKey = 'EXPENSE:server-payable-origin';
const receivableKey = 'PAYMENT_PLAN:server-plan:INSTALLMENT:server-installment';
const reviewKey = 'BOOKING:server-review-origin';
const commitmentKey = 'COMMITMENT:server-commitment-origin';
const references = () => v2TestFixture().references;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function scenarioSources(): FinanceCashProjection['sources'] {
  return [
    { sourceKey: payableKey, origin: 'PAYABLE', direction: 'OUT', amountMinor: 900001, expectedOn: '2026-10-12', accountId: null, reviewRequired: false },
    { sourceKey: receivableKey, origin: 'RECEIVABLE', direction: 'IN', amountMinor: 300003, expectedOn: null, accountId: null, reviewRequired: false },
    { sourceKey: reviewKey, origin: 'RECEIVABLE', direction: 'IN', amountMinor: 123456, expectedOn: '2026-10-18', accountId: null, reviewRequired: true },
    { sourceKey: commitmentKey, origin: 'COMMITMENT', direction: 'OUT', amountMinor: 765001, expectedOn: null, accountId: 'account-a', reviewRequired: false },
  ];
}
function catalog(): FinanceCashProjection { return { ...projection('planning-catalog-base'), events: [] }; }
function projection(token = 'planning-own-base'): FinanceCashProjection {
  const report = references().report;
  return { businessId: context.businessId, currency: 'PYG', timeZone: report.timeZone, asOf: report.asOf, token, scenarioToken: 'server-scenario-token', sources: scenarioSources(), registeredBalanceMinor: 1000000, forecastDeltaMinor: -245000, projectedBalanceMinor: 755000, basis: 'REGISTERED_CASH_PLUS_SCENARIO', events: [{ sourceKey: payableKey, origin: 'PAYABLE', amountMinor: -700001, expectedOn: '2026-10-14', probabilityBasisPoints: 3500, weightedAmountMinor: -245000, accountId: 'account-a', reason: 'Pago parcial previsto por el dueño' }], coverage: { unknownAccountIds: [], unassignedSourceKeys: [], undatedSourceKeys: [receivableKey], reviewBookingIds: ['booking-requires-review'], excludedSourceKeys: [receivableKey] } };
}
function postInputs(fetch: ReturnType<typeof vi.fn>): FinanceCashProjectionInput[] {
  return fetch.mock.calls.filter(([, request]) => (request as RequestInit | undefined)?.method === 'POST').map(([, request]) => JSON.parse((request as RequestInit).body as string) as FinanceCashProjectionInput);
}
function mount(input = { context, references: references(), access }) { return render(<FinancePlanningScenario {...input} />); }
async function includePayable(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: `Agregar gasto ${payableKey} al escenario` }));
  return within(screen.getByRole('group', { name: 'Evento del escenario 1' }));
}
async function fillReason(user: ReturnType<typeof userEvent.setup>, value = 'Pago parcial previsto por el dueño') {
  await user.type(screen.getByLabelText('Supuesto del escenario'), value);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('consulta fuentes sólo de forma explícita; conserva fecha desconocida y bloquea REVIEW sin incluir eventos automáticamente', async () => {
  const fetch = vi.fn(async (_url: string, _request?: RequestInit) => json(catalog())); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount(); expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' }));
  await screen.findByText(`cobro pendiente ${receivableKey}`);
  expect(screen.getAllByText(/Sin fecha informada/)).toHaveLength(2);
  expect(screen.getByRole('button', { name: `Agregar cobro pendiente ${reviewKey} al escenario` })).toBeDisabled();
  expect(screen.queryByLabelText('Fecha esperada')).not.toBeInTheDocument();
  expect(new URL(fetch.mock.calls[0][0]).pathname).toContain('/finance/v2/planning-preview'); expect(postInputs(fetch)[0]).toMatchObject({ asOf: references().report.asOf, baseToken: '', events: [], excludedSourceKeys: [] });
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/);
  expect(postInputs(fetch)[1]).toMatchObject({ baseToken: 'planning-catalog-base', events: [], excludedSourceKeys: [] });
});

it('envía clave exacta del servidor, edición explícita, exclusión de cuota y evento manual separados; muestra proyección ponderada del servidor', async () => {
  let calls = 0; const fetch = vi.fn(async (_url: string, _request?: RequestInit) => json(++calls === 1 ? catalog() : projection())); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount(); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); const event = await includePayable(user);
  const amount = event.getByRole('textbox', { name: 'Importe previsto, guaraníes PYG' }); expect(amount).toHaveValue('900001');
  await user.clear(amount); await user.type(amount, '700001');
  await user.clear(event.getByLabelText('Fecha esperada')); await user.type(event.getByLabelText('Fecha esperada'), '2026-10-14');
  await user.clear(event.getByLabelText('Probabilidad (%)')); await user.type(event.getByLabelText('Probabilidad (%)'), '35');
  await user.selectOptions(event.getByLabelText('Cuenta prevista (opcional)'), 'account-a'); await fillReason(user);
  await user.click(screen.getByRole('button', { name: `Excluir cobro pendiente ${receivableKey} del escenario` }));
  await user.click(screen.getByRole('button', { name: 'Agregar evento previsto' })); const manual = within(screen.getByRole('group', { name: 'Evento del escenario 2' }));
  await user.selectOptions(manual.getByLabelText('Dirección'), 'IN'); await user.type(manual.getByRole('textbox', { name: 'Importe previsto, guaraníes PYG' }), '800'); await user.type(manual.getByLabelText('Fecha esperada'), '2026-10-15'); await user.type(manual.getByLabelText('Supuesto del escenario'), 'Entrada manual declarada');
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/);
  expect(postInputs(fetch)[1]).toMatchObject({ asOf: references().report.asOf, baseToken: 'planning-catalog-base', accountIds: ['account-a'], excludedSourceKeys: [receivableKey], events: [
    { sourceKey: payableKey, direction: 'OUT', amountMinor: 700001, expectedOn: '2026-10-14', probabilityBasisPoints: 3500, accountId: 'account-a', reason: 'Pago parcial previsto por el dueño' },
    { sourceKey: null, direction: 'IN', amountMinor: 800, expectedOn: '2026-10-15', probabilityBasisPoints: 10000, accountId: null, reason: 'Entrada manual declarada' },
  ] });
  expect(screen.getByText(/Variación prevista/)).toHaveTextContent(formatMoney(-245000)); expect(screen.getByText(/saldo proyectado/)).toHaveTextContent(formatMoney(755000));
  expect(screen.getByText(/2026-10-14 · PAYABLE/)).toHaveTextContent(formatMoney(-245000));
  expect(fetch.mock.calls.every(([url, request]) => String(url).includes('/finance/v2/planning-preview') && (request as RequestInit).method === 'POST' && !new Headers((request as RequestInit).headers).has('Idempotency-Key'))).toBe(true);
});

it('409 conserva edición y exclusiones; refresca base sólo al pedirlo y usa token propio, sin repetir POST automáticamente', async () => {
  let posts = 0; const fetch = vi.fn(async (_url: string, _request?: RequestInit) => ++posts === 1 ? json(catalog()) : posts === 3 ? json({ message: 'PROJECTION_BASE_STALE' }, 409) : json(projection(posts === 2 ? 'planning-base-old' : 'planning-base-new'))); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount(); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); const event = await includePayable(user); await fillReason(user, 'Supuesto conservado');
  await user.click(screen.getByRole('button', { name: `Excluir cobro pendiente ${receivableKey} del escenario` }));
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/);
  const amount = event.getByRole('textbox', { name: 'Importe previsto, guaraníes PYG' }); await user.clear(amount); await user.type(amount, '710001');
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); const refresh = await screen.findByRole('button', { name: 'Consultar base actual y conservar escenario' });
  expect(posts).toBe(3); expect(postInputs(fetch)[2].baseToken).toBe('planning-base-old'); expect(postInputs(fetch)[2].baseToken).not.toBe(references().report.token);
  expect(screen.getByLabelText('Supuesto del escenario')).toHaveValue('Supuesto conservado'); await user.click(refresh); await screen.findByText(/Variación prevista/);
  expect(postInputs(fetch)[3]).toMatchObject({ baseToken: '', excludedSourceKeys: [receivableKey], events: [{ sourceKey: payableKey, amountMinor: 710001, reason: 'Supuesto conservado' }] });
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await waitFor(() => expect(posts).toBe(5)); expect(postInputs(fetch)[4].baseToken).toBe('planning-base-new');
});

it('lectura500 y fuente retirada preservan los supuestos y exclusiones, sin sustituirlos por importes nuevos ni descartarlos silenciosamente', async () => {
  let calls = 0; const fetch = vi.fn(async (_url: string, _request?: RequestInit) => ++calls === 2 ? json({ message: 'Fallo de lectura' }, 500) : json(calls === 1 ? catalog() : calls === 3 ? { ...catalog(), token: 'planning-source-removed', sources: [] } : projection())); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount(); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); const event = await includePayable(user); await fillReason(user, 'Conservar aunque cambie la lectura');
  const amount = event.getByRole('textbox', { name: 'Importe previsto, guaraníes PYG' }); await user.clear(amount); await user.type(amount, '500001'); await user.click(screen.getByRole('button', { name: `Excluir cobro pendiente ${receivableKey} del escenario` }));
  await user.click(screen.getByRole('button', { name: 'Actualizar fuentes y conservar supuestos' })); await screen.findByText(/Conservamos los supuestos y las exclusiones elegidas/);
  expect(screen.getByLabelText('Supuesto del escenario')).toHaveValue('Conservar aunque cambie la lectura'); expect(amount).toHaveValue('500.001');
  await user.click(screen.getByRole('button', { name: 'Actualizar fuentes y conservar supuestos' })); await screen.findByText(/El origen ya no aparece en la última lectura/);
  expect(screen.getByLabelText('Supuesto del escenario')).toHaveValue('Conservar aunque cambie la lectura'); expect(screen.getByRole('button', { name: `Quitar exclusión ${receivableKey}` })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/); expect(postInputs(fetch)[3]).toMatchObject({ baseToken: 'planning-source-removed', excludedSourceKeys: [receivableKey], events: [{ sourceKey: payableKey, amountMinor: 500001, reason: 'Conservar aunque cambie la lectura' }] });
});

it('excluir una fuente conserva su edición y deja de enviarla; volver a incluir conserva el mismo supuesto', async () => {
  const fetch = vi.fn(async (_url: string, _request?: RequestInit) => json(projection())); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount(); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); const event = await includePayable(user); await fillReason(user, 'Supuesto de fuente excluida');
  const amount = event.getByRole('textbox', { name: 'Importe previsto, guaraníes PYG' }); await user.clear(amount); await user.type(amount, '123001');
  await user.click(screen.getByRole('button', { name: `Excluir gasto ${payableKey} del escenario` })); expect(amount).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/); expect(postInputs(fetch)[1]).toMatchObject({ events: [], excludedSourceKeys: [payableKey] });
  await user.click(screen.getByRole('button', { name: `Agregar gasto ${payableKey} al escenario` })); expect(amount).not.toBeDisabled(); expect(amount).toHaveValue('123.001'); expect(screen.getByLabelText('Supuesto del escenario')).toHaveValue('Supuesto de fuente excluida');
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/); expect(postInputs(fetch)[2]).toMatchObject({ excludedSourceKeys: [], events: [{ sourceKey: payableKey, amountMinor: 123001, reason: 'Supuesto de fuente excluida' }] });
});

it('fuentes default-deny y otro rol no hacen GET; al renovar bearer conserva selección y toma token vigente en preview explícito', async () => {
  const fetch = vi.fn(async (_url: string, _request?: RequestInit) => json(projection())); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); const rendered = mount({ context, references: references(), access: { ...access, role: 'ADMIN' } });
  expect(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Consultar escenario' })).toBeDisabled(); expect(fetch).not.toHaveBeenCalled();
  rendered.rerender(<FinancePlanningScenario context={context} references={references()} access={access} />); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); await includePayable(user); await fillReason(user, 'Misma identidad con bearer vigente');
  rendered.rerender(<FinancePlanningScenario context={{ ...context, accessToken: 'planning-renewed-token' }} references={references()} access={access} />); expect(fetch).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/);
  const post = fetch.mock.calls.at(-1)!; expect(new Headers((post[1] as RequestInit).headers).get('Authorization')).toBe('Bearer planning-renewed-token'); expect(postInputs(fetch)[1].events[0].sourceKey).toBe(payableKey);
});

it('catálogo con origen duplicado falla cerrado y no muestra fuentes ambiguas como opciones válidas', async () => {
  const current = catalog(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...current, sources: [current.sources[0], current.sources[0]] })));
  const user = userEvent.setup(); mount(); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); await screen.findByText(/respuesta no válida/); expect(screen.queryByRole('button', { name: `Agregar gasto ${payableKey} al escenario` })).not.toBeInTheDocument();
});

it('compromiso usa pendiente, clave y cuenta del catálogo servidor sin derivar consumos; fecha ausente requiere un supuesto explícito', async () => {
  const fetch = vi.fn(async (_url: string, _request?: RequestInit) => json(projection())); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount(); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); await user.click(await screen.findByRole('button', { name: `Agregar compromiso ${commitmentKey} al escenario` }));
  expect(screen.getByRole('textbox', { name: 'Importe previsto, guaraníes PYG' })).toHaveValue('765001'); expect(screen.getByLabelText('Fecha esperada')).toHaveValue(''); expect(screen.getByLabelText('Cuenta prevista (opcional)')).toHaveValue('account-a');
  await user.type(screen.getByLabelText('Fecha esperada'), '2026-10-21'); await fillReason(user, 'Vencimiento previsto del compromiso'); await user.click(screen.getByRole('button', { name: 'Consultar escenario' })); await screen.findByText(/Variación prevista/);
  expect(postInputs(fetch)[1].events).toEqual([{ sourceKey: commitmentKey, direction: 'OUT', amountMinor: 765001, expectedOn: '2026-10-21', probabilityBasisPoints: 10000, accountId: 'account-a', reason: 'Vencimiento previsto del compromiso' }]);
});

it('active=false bloquea nuevas lecturas, preview y selección; volver a la vista conserva supuestos sin requests automáticos', async () => {
  const fetch = vi.fn(async (_url: string, _request?: RequestInit) => json(projection())); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); const rendered = mount(); await user.click(screen.getByRole('button', { name: 'Consultar fuentes del escenario' })); await includePayable(user); await fillReason(user, 'Mantener al cambiar de vista');
  rendered.rerender(<FinancePlanningScenario context={context} references={references()} access={access} active={false} />);
  expect(screen.getByRole('button', { name: 'Actualizar fuentes y conservar supuestos' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Consultar escenario' })).toBeDisabled(); expect(screen.getByRole('button', { name: `Excluir gasto ${payableKey} del escenario` })).toBeDisabled(); expect(screen.getByLabelText('Supuesto del escenario')).toBeDisabled(); expect(fetch).toHaveBeenCalledTimes(1);
  rendered.rerender(<FinancePlanningScenario context={context} references={references()} access={access} active />); expect(fetch).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('Supuesto del escenario')).toHaveValue('Mantener al cambiar de vista'); expect(screen.getByLabelText('Supuesto del escenario')).not.toBeDisabled();
});
