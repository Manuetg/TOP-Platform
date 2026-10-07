import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { FinanceBudgetComparisonPanel } from './FinanceBudgetComparisonPanel';
import { v2TestFixture, v2TestId } from './v2-test.fixture';
import type { FinanceV2Access } from './v2-ui.types';
import type { FinanceBudgetComparison } from './finance-v2.types';
import { getV2BudgetComparison } from './finance-v2-api';

const context = { businessId: 'synthetic-a', userId: 'read-owner', accessToken: 'synthetic-token' };
const access: FinanceV2Access = { role: 'OWNER', capabilities: ['finance.read', 'finance.planning'], availableSections: ['budget-comparison'] };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });
function report(selected: boolean): FinanceBudgetComparison {
  return { businessId: context.businessId, currency: 'PYG', timeZone: 'America/Asuncion', from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-05T12:00:00.000Z', token: 'source-token', sourceLimit: 5000, budgetId: v2TestId, budgetVersion: 2, approvedRevisionId: v2TestId, forecastBasis: selected ? 'ACTUAL_PLUS_PENDING_COMMITMENTS' : null, scenarioToken: selected ? 'scenario-token' : null, estimatedSelectedMinor: 300000, ownerImputedMinor: 250000, coverage: { scope: 'KNOWN_OPERATING_SOURCES_ONLY', costSourceToken: 'cost-token', costSourceCount: 1, pendingCommitmentSourceCount: 1, unknownCostSourceIds: [], missingEvidenceSourceIds: [], unsupportedReasons: [], sourceLimit: 5000 }, lines: [{ resourceId: null, categoryId: 'category-a', approvedMinor: 1000000, actualMinor: 800000, committedPendingMinor: 400000, forecastMinor: selected ? 1200000 : null, actualDeviationMinor: -200000, forecastDeviationMinor: selected ? 200000 : null }] };
}
function mount(permission: FinanceV2Access = access) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<QueryClientProvider client={client}><FinanceBudgetComparisonPanel context={context} access={permission} references={v2TestFixture().references} initialMonth="2026-09" active /></QueryClientProvider>);
}

it('selector por defecto no proyecta; opt-in GET muestra previsión y desvío exactos del servidor sin escritura', async () => {
  const fetch = vi.fn(async (url: string, _request?: RequestInit) => new Response(JSON.stringify(report(new URL(url).searchParams.has('forecastBasis'))), { headers: { 'Content-Type': 'application/json' } })); vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup(); mount();
  await screen.findByText('No se ha seleccionado una proyección de costos.');
  expect(new URL(fetch.mock.calls[0][0]).searchParams.has('forecastBasis')).toBe(false);
  expect(screen.getByLabelText('Base de previsión de costos')).toHaveValue('');
  await user.selectOptions(screen.getByLabelText('Base de previsión de costos'), 'ACTUAL_PLUS_PENDING_COMMITMENTS');
  await screen.findByText(/1\.200\.000/);
  expect(new URL(fetch.mock.calls.at(-1)![0]).searchParams.get('forecastBasis')).toBe('ACTUAL_PLUS_PENDING_COMMITMENTS');
  const forecastDeviation = screen.getByText('Desviación prevista').nextElementSibling;
  expect(forecastDeviation).toHaveTextContent(/200\.000/);
  expect(screen.getByText('Base aprobada').nextElementSibling).toHaveTextContent(/1\.000\.000/);
  expect(screen.getByText(/Estimaciones laborales seleccionadas/)).toHaveTextContent(/300\.000/);
  expect(screen.getByText(/Trabajo propio imputado:/)).toHaveTextContent(/250\.000/);
  expect(screen.getByText(/no garantiza el costo final/)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Base de previsión de costos'), '');
  await waitFor(() => expect(screen.getByText('No se ha seleccionado una proyección de costos.')).toBeInTheDocument());
  expect(fetch.mock.calls.every(([, request]) => !request?.method || request.method === 'GET')).toBe(true);
  expect(fetch.mock.calls.every(([, request]) => !new Headers(request?.headers).has('Idempotency-Key'))).toBe(true);
});

it('cobertura desconocida advierte explícitamente sin sumar estimados ni inventar costo cero', async () => {
  const response = report(true); response.coverage.unknownCostSourceIds.push('labor-unknown');
  vi.stubGlobal('fetch', vi.fn(async (url:string)=>new Response(JSON.stringify(new URL(url).searchParams.has('forecastBasis')?response:report(false)), { headers: { 'Content-Type': 'application/json' } })));
  const user=userEvent.setup();mount();await screen.findByText('Costo real');
  await user.selectOptions(screen.getByLabelText('Base de previsión de costos'),'ACTUAL_PLUS_PENDING_COMMITMENTS');
  await screen.findByText(/Hay fuentes desconocidas o evidencia pendiente/);
  expect(screen.getByText(/Estos importes sólo cubren las fuentes conocidas/)).toBeInTheDocument();
  expect(screen.getByText('Costo real').nextElementSibling).toHaveTextContent(/800\.000/);
});

it('una previsión fallida conserva la selección y requiere relectura explícita sin mostrar cifras anteriores',async()=>{
  let selectedReads=0;
  const fetch=vi.fn(async(url:string)=>new URL(url).searchParams.has('forecastBasis')&&++selectedReads===1?new Response(JSON.stringify({message:'Proveedor no disponible'}),{status:503,headers:{'Content-Type':'application/json'}}):new Response(JSON.stringify(report(new URL(url).searchParams.has('forecastBasis'))),{headers:{'Content-Type':'application/json'}}));
  vi.stubGlobal('fetch',fetch);const user=userEvent.setup();mount();await screen.findByText('Costo real');
  await user.selectOptions(screen.getByLabelText('Base de previsión de costos'),'ACTUAL_PLUS_PENDING_COMMITMENTS');
  await screen.findByRole('alert');expect(screen.queryByText('Costo real')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Base de previsión de costos')).toHaveValue('ACTUAL_PLUS_PENDING_COMMITMENTS');
  expect(fetch).toHaveBeenCalledTimes(2);await user.click(screen.getByRole('button',{name:'Volver a cargar'}));
  await screen.findByText(/1\.200\.000/);expect(fetch).toHaveBeenCalledTimes(3);
});

it('sin revisión aprobada la previsión conocida no fabrica desviación ni meta cero',async()=>{
  const fetch=vi.fn(async(url:string)=>{const response=report(new URL(url).searchParams.has('forecastBasis'));response.approvedRevisionId=null;response.lines[0].approvedMinor=null;response.lines[0].actualDeviationMinor=null;response.lines[0].forecastDeviationMinor=null;return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});});
  vi.stubGlobal('fetch',fetch);const user=userEvent.setup();mount();await screen.findByText('Costo real');
  await user.selectOptions(screen.getByLabelText('Base de previsión de costos'),'ACTUAL_PLUS_PENDING_COMMITMENTS');await screen.findByText(/1\.200\.000/);
  expect(screen.getByText('Base aprobada').nextElementSibling).toHaveTextContent('Sin base confirmada');
  expect(screen.getByText('Desviación prevista').nextElementSibling).toHaveTextContent('Sin base confirmada');
});

it.each([
  {role:'ADMIN',capabilities:['finance.planning'],availableSections:['budget-comparison']},
  {role:'OWNER',capabilities:[],availableSections:['budget-comparison']},
  {role:'OWNER',capabilities:['finance.planning'],availableSections:[]},
])('no lee cifras de presupuesto con acceso no habilitado %#',(permission)=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);mount(permission);
  expect(screen.queryByLabelText('Base de previsión de costos')).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ['base distinta de la consulta',(value:FinanceBudgetComparison)=>{value.forecastBasis=null;}],
  ['escenario sin token',(value:FinanceBudgetComparison)=>{value.scenarioToken=null;}],
  ['importe no entero',(value:FinanceBudgetComparison)=>{value.lines[0].forecastMinor=1200000.5;}],
  ['importe fuera del rango seguro',(value:FinanceBudgetComparison)=>{value.lines[0].actualMinor=Number.MAX_SAFE_INTEGER+1;}],
  ['compromiso negativo',(value:FinanceBudgetComparison)=>{value.lines[0].committedPendingMinor=-1;}],
  ['cobertura ausente',(value:FinanceBudgetComparison)=>{delete (value as Partial<FinanceBudgetComparison>).coverage;}],
  ['conteo de cobertura inválido',(value:FinanceBudgetComparison)=>{value.coverage.costSourceCount=-1;}],
  ['mes diferente',(value:FinanceBudgetComparison)=>{value.from='2026-08-01';}],
  ['fin mensual distinto',(value:FinanceBudgetComparison)=>{value.to='2026-11-01';}],
  ['meta o desviaciones sin revisión aprobada',(value:FinanceBudgetComparison)=>{value.approvedRevisionId=null;}],
] as const)('rechaza respuesta de previsión malformada: %s',async(_label,alter)=>{
  const response=report(true);alter(response);const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
  await expect(getV2BudgetComparison(context,'2026-09',undefined,'ACTUAL_PLUS_PENDING_COMMITMENTS')).rejects.toMatchObject({name:'ApiResponseError'});
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('una lectura sin opt-in rechaza previsión recibida sin intención',async()=>{
  const response=report(false);response.lines[0].forecastMinor=1200000;
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}})));
  await expect(getV2BudgetComparison(context,'2026-09')).rejects.toMatchObject({name:'ApiResponseError'});
});
