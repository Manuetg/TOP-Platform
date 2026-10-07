import { agreedNightPrices, planServiceCertificate, planTerminalRecognition } from './finance-recognition.rules';
import { projectResourceProfitability } from './finance-recognition.projection';
import type { CertifyServiceCommand, RecognitionContext, RecognitionHead, ServiceCertificate, ServicePricingBasis, TerminalRecognitionInput } from './finance-recognition.types';

const pricing = (): ServicePricingBasis => ({ businessId: 'business', bookingId: 'booking', resourceId: 'resource', originalSnapshotId: 'snapshot', sourceId: 'snapshot', serviceRevisionId: null, revisionNumber: 0, sourceHash: 'hash', currency: 'PYG', checkInDate: '2026-09-01', checkOutDate: '2026-09-04', mode: 'CALCULATED', agreedAmountMinor: 600, totalAmountMinor: 600, suggestedAmountMinor: 600, adjustmentAmountMinor: 0, overrideReason: null, nights: 3, breakdown: [{ date: '2026-09-01', amountMinor: 100 }, { date: '2026-09-02', amountMinor: 200 }, { date: '2026-09-03', amountMinor: 300 }] });
const context = (): RecognitionContext => ({ booking: { businessId: 'business', bookingId: 'booking', resourceIds: ['resource'], bookingUpdatedAt: '2026-10-01T10:00:00.000Z', checkInDate: '2026-09-01', checkOutDate: '2026-09-04', status: 'COMPLETED', checkInEventId: 'in', checkOutEventId: 'out' }, pricing: pricing(), localToday: '2026-10-05' });
const command = (): CertifyServiceCommand => ({ bookingId: 'booking', expectedBookingUpdatedAt: '2026-10-01T10:00:00.000Z', expectedCertificateVersion: 0, expectedPricingSourceId: 'snapshot', servedNights: ['2026-09-01', '2026-09-02'], effectiveCheckInOn: '2026-09-01', effectiveCheckOutOn: '2026-09-03', evidence: 'Registro de estadía revisado.', reason: 'Certificación manual.', supersedesCertificateId: null });
const certify = (cmd: CertifyServiceCommand = command(), ctx: RecognitionContext = context(), head: RecognitionHead | null = null): ServiceCertificate => planServiceCertificate({ id: head ? 'certificate-next' : 'certificate', businessId: 'business', actorUserId: 'owner', recordedAt: '2026-10-05T10:00:00.000Z', command: cmd, context: ctx, head });

describe('FIN-021 noches certificadas y precio fijado', () => {
  it('usa fecha real y conserva precio de noches no servidas sin redistribuir', () => {
    const result = certify();
    expect(result.units).toEqual([{ localNight: '2026-09-01', amountMinor: 100 }, { localNight: '2026-09-02', amountMinor: 200 }]);
    expect(result.pricing.agreedAmountMinor).toBe(600);
    expect(result.servicePolicyVersion).toBe('NIGHT_SERVICE_V1');
  });
  it('reparte override por pesos exactos y fecha como desempate', () => {
    const source = { ...pricing(), mode: 'MANUAL_OVERRIDE' as const, agreedAmountMinor: 1000, totalAmountMinor: 1000, adjustmentAmountMinor: 400, overrideReason: 'Precio acordado.' };
    expect(agreedNightPrices(source).nights.map(unit => unit.amountMinor)).toEqual([167, 333, 500]);
  });
  it('manual sin plan reparte todas las noches pactadas, sin tarifa inventada', () => {
    const source = { ...pricing(), mode: 'MANUAL_NO_RATE_PLAN' as const, agreedAmountMinor: 1000, totalAmountMinor: 1000, suggestedAmountMinor: null, adjustmentAmountMinor: null, overrideReason: 'Acuerdo manual.', breakdown: [] };
    expect(agreedNightPrices(source)).toEqual({ policyVersion: 'EQUAL_AGREED_NIGHTS_V1', nights: [{ localNight: '2026-09-01', amountMinor: 334 }, { localNight: '2026-09-02', amountMinor: 333 }, { localNight: '2026-09-03', amountMinor: 333 }] });
  });
  it('rechaza pesos cero positivos y conserva cero explícito', () => {
    const source = { ...pricing(), mode: 'MANUAL_OVERRIDE' as const, agreedAmountMinor: 1, totalAmountMinor: 1, suggestedAmountMinor: 0, adjustmentAmountMinor: 1, overrideReason: 'Acuerdo.', breakdown: pricing().breakdown.map(item => ({ ...item, amountMinor: 0 })) };
    expect(() => agreedNightPrices(source)).toThrow('pesos cero');
    expect(agreedNightPrices({ ...source, agreedAmountMinor: 0, totalAmountMinor: 0, adjustmentAmountMinor: 0 }).nights.every(unit => unit.amountMinor === 0)).toBe(true);
  });
  it('mantiene aritmética exacta cerca de MAX_SAFE_INTEGER', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const source = { ...pricing(), mode: 'MANUAL_NO_RATE_PLAN' as const, agreedAmountMinor: max, totalAmountMinor: max, suggestedAmountMinor: null, adjustmentAmountMinor: null, overrideReason: 'Acuerdo.', breakdown: [] };
    expect(agreedNightPrices(source).nights.reduce((sum, unit) => sum + BigInt(unit.amountMinor), 0n)).toBe(BigInt(max));
  });
  it.each(['2026-09-04', '2026-08-31', '2026-09-31'])('rechaza noche fuera de prestación o fecha inválida %s', night => { expect(() => certify({ ...command(), servedNights: [night] })).toThrow(); });
  it('rechaza duplicados', () => { expect(() => certify({ ...command(), servedNights: ['2026-09-01', '2026-09-01'] })).toThrow(); });
  it('no reconoce la noche local actual aún sin terminar', () => {
    const ctx = context(); ctx.localToday = '2026-09-02'; ctx.booking.status = 'IN_PROGRESS'; ctx.booking.checkOutEventId = null;
    expect(() => certify({ ...command(), effectiveCheckOutOn: null }, ctx)).toThrow('no ha terminado');
    expect(certify({ ...command(), servedNights: ['2026-09-01'], effectiveCheckOutOn: null }, ctx).units).toHaveLength(1);
  });
  it('no convierte estado o calendario en prueba de ingreso', () => {
    const ctx = context(); ctx.booking.checkInEventId = null;
    expect(() => certify(command(), ctx)).toThrow('ingreso manual');
  });
  it('COMPLETED exige salida registrada y efectiva', () => { expect(() => certify({ ...command(), effectiveCheckOutOn: null })).toThrow('salida efectiva'); });
  it('no-show no crea servicio', () => { const ctx = context(); ctx.booking.status = 'NO_SHOW'; expect(() => certify(command(), ctx)).toThrow('operación compatible'); });
  it('rechaza fuentes cross-tenant y CAS obsoleto', () => {
    const ctx = context(); ctx.pricing.businessId = 'otro'; expect(() => certify(command(), ctx)).toThrow('mismo Negocio');
    expect(() => certify({ ...command(), expectedPricingSourceId: 'revision' })).toThrow('cambiaron');
    expect(() => certify({ ...command(), expectedCertificateVersion: 1 })).toThrow('certificado cambió');
  });
  it('corrección vacía añade versión conservando fuente previa sin destruirla', () => {
    const first = certify(); const head = { id: first.id, version: 1, certificate: first };
    const reversed = certify({ ...command(), expectedCertificateVersion: 1, supersedesCertificateId: first.id, servedNights: [] }, context(), head);
    expect(reversed.version).toBe(2); expect(reversed.units).toEqual([]); expect(first.units).toHaveLength(2); expect(reversed.pricing.sourceHash).toBe(first.pricing.sourceHash);
    expect(reversed.id).not.toBe(first.id);
  });
  it('rechaza breakdown incompleto, moneda, overflow y unidad no soportada', () => {
    expect(() => agreedNightPrices({ ...pricing(), breakdown: pricing().breakdown.slice(0, 2) })).toThrow('Faltan');
    expect(() => agreedNightPrices({ ...pricing(), currency: 'USD' })).toThrow('PYG');
    expect(() => agreedNightPrices({ ...pricing(), agreedAmountMinor: Number.MAX_SAFE_INTEGER + 1 })).toThrow('entero seguro');
    expect(() => agreedNightPrices({ ...pricing(), totalAmountMinor: 601 })).toThrow('total fijado');
    const ctx = context(); ctx.booking.resourceIds = []; expect(() => certify(command(), ctx)).toThrow('Resource');
  });
});

describe('D2 clasificación terminal sin doble ingreso', () => {
  const terminal = (): TerminalRecognitionInput => ({ businessId: 'business', bookingId: 'booking', bookingStatus: 'CANCELLED', sourceKind: 'TERMINAL_FINAL_AMOUNT', terminalAdjustmentId: 'final', terminalSourceHash: 'final-hash', recognitionOn: '2026-10-05', finalAmountMinor: 400, confirmedNonServiceAmountMinor: 100, coverage: 'COMPLETE', classification: 'Acuerdo comercial por cancelación.', reason: 'Importe final confirmado.', serviceCertificateId: 'certificate', serviceCertificateVersion: 1 });
  const head = (): RecognitionHead => ({ id: 'certificate', version: 1, certificate: certify() });
  it('reconoce exclusivamente residual explícito con vínculo a servicio vigente', () => { expect(planTerminalRecognition(terminal(), head(), '2026-10-05').serviceAmountMinor).toBe(300); });
  it('bloquea cobertura incompleta, final menor o intento de reconocer F completo', () => {
    expect(() => planTerminalRecognition({ ...terminal(), coverage: 'INCOMPLETE' }, head(), '2026-10-05')).toThrow('cobertura');
    expect(() => planTerminalRecognition({ ...terminal(), finalAmountMinor: 200 }, head(), '2026-10-05')).toThrow('menor');
    expect(() => planTerminalRecognition({ ...terminal(), confirmedNonServiceAmountMinor: 400 }, head(), '2026-10-05')).toThrow('reproducir');
  });
  it('ausencia explícita puede confirmar final sin fabricar noches', () => { expect(planTerminalRecognition({ ...terminal(), coverage: 'DECLARED_NONE', serviceCertificateId: null, serviceCertificateVersion: 0, confirmedNonServiceAmountMinor: 400 }, null, '2026-10-05').serviceAmountMinor).toBe(0); });
  it('una corrección del certificado deja inválido el vínculo anterior', () => { const changed = head(); changed.version = 2; changed.certificate.version = 2; expect(() => planTerminalRecognition(terminal(), changed, '2026-10-05')).toThrow('certificado efectivo'); });
});

describe('FIN-024 recursos más sin asignar conservan el negocio', () => {
  const query = () => ({ from: '2026-09-01', to: '2026-10-01', resourceIds: ['resource', 'archived'], units: certify().units.map(unit => ({ ...unit, certificateId: 'certificate', certificateVersion: 1, bookingId: 'booking', resourceId: 'resource' })), terminalEntries: [], costSources: [{ sourceId: 'expense-line', sourceVersion: 1, consumedOn: '2026-09-01', currency: 'PYG', amountMinor: 101, operational: true, basis: 'ACTUAL' as const, allocations: [{ resourceId: 'resource', amountMinor: 60 }, { resourceId: 'archived', amountMinor: 30 }, { resourceId: null, amountMinor: 11 }] }], coverage: { complete: true, pendingByReason: {} } });
  it('suma cada costo una vez y preserva archivo/sin asignar', () => {
    const result = projectResourceProfitability(query());
    expect(result.totals.resultMinor).toBe(199); expect(result.rows.reduce((sum, row) => sum + row.resultMinor, 0)).toBe(199);
    expect(result.rows.find(row => row.resourceId === null)?.costMinor).toBe(11);
  });
  it('sin ingreso o cobertura completa margen es null', () => {
    const result = projectResourceProfitability({ ...query(), coverage: { complete: false, pendingByReason: { LEGACY: 1 } } });
    expect(result.rows.every(row => row.marginBasisPoints === null)).toBe(true);
    expect(projectResourceProfitability({ ...query(), units: [] }).totals.marginBasisPoints).toBeNull();
  });
  it('no suma actual más estimado ni versiones repetidas de noches', () => {
    const input = query(); expect(() => projectResourceProfitability({ ...input, costSources: [...input.costSources, { ...input.costSources[0], basis: 'ESTIMATE' }] })).toThrow('una vez');
    expect(() => projectResourceProfitability({ ...input, units: [...input.units, input.units[0]] })).toThrow('versión efectiva');
  });
  it('una asignación que pierde dinero bloquea el resultado', () => { const input = query(); input.costSources[0].allocations[0].amountMinor = 59; expect(() => projectResourceProfitability(input)).toThrow('fuente exacta'); });
  it('partida terminal obsoleta queda pendiente y excluida', () => {
    const result = projectResourceProfitability({ ...query(), terminalEntries: [{ id: 'terminal', bookingId: 'booking', resourceId: 'resource', recognitionOn: '2026-09-30', amountMinor: 50, stale: true }] });
    expect(result.totals.terminalRevenueMinor).toBe(0); expect(result.coverage.pendingByReason.TERMINAL_SOURCE_STALE).toBe(1); expect(result.totals.marginBasisPoints).toBeNull();
  });
});
