import { FinanceInputError } from '../domain/finance.errors';
import { parseFinanceClosePeriodCommand, parseFinanceCreatePeriodCommand, parseFinanceReopenPeriodCommand } from './finance-close.validation';
import { parseFinanceBookingResultQuery, parseFinanceProfitabilityQuery, parseFinanceRecognitionIdempotencyKey, parseFinanceServiceCertificateCommand, parseFinanceTerminalRecognitionCommand } from './finance-recognition.validation';

const id = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(64);
const service = () => ({ bookingId: id, expectedBookingUpdatedAt: '2026-10-05T00:00:00.000Z', expectedCertificateVersion: 0, expectedPricingSourceId: id, servedNights: ['2026-09-01'], effectiveCheckInOn: '2026-09-01', effectiveCheckOutOn: null, evidence: ' Registro revisado. ', reason: ' Certificar. ', supersedesCertificateId: null });
const terminal = () => ({ bookingId: id, expectedBookingUpdatedAt: '2026-10-05T00:00:00.000Z', expectedVersion: 0, expectedPricingRevisionId: id, serviceCertificateId: null, serviceCertificateVersion: 0, recognitionOn: '2026-09-01', confirmedNonServiceAmountMinor: 0, coverage: 'DECLARED_NONE', classification: 'Cancelación', reason: 'Confirmar.' });

describe('Parsing de Recognition/Close', () => {
  it('resultado por reserva normaliza ISO con zona a UTC y conserva token opcional', () => {
    expect(parseFinanceBookingResultQuery({ from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-05T09:00:00-03:00', token })).toEqual({ from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-05T12:00:00.000Z', expectedSourceToken: token });
    expect(parseFinanceBookingResultQuery({ from: '2026-09-01', to: '2026-10-01' })).toEqual({ from: '2026-09-01', to: '2026-10-01' });
  });
  it.each(['2026-02-30T12:00:00Z', '2026-10-05T12:00:00', '2026-10-05T24:00:00Z', '2026-10-05T12:00:00+99:00'])('rechaza corte inválido/no fechado de resultado por reserva %s', asOf => {
    expect(() => parseFinanceBookingResultQuery({ from: '2026-09-01', to: '2026-10-01', asOf })).toThrow(FinanceInputError);
  });
  it('normaliza texto sin admitir actor, negocio, precio o importe final del cliente', () => {
    expect(parseFinanceServiceCertificateCommand(service()).evidence).toBe('Registro revisado.');
    for (const field of ['actorUserId', 'businessId', 'finalAmountMinor', 'pricing', 'resourceId']) {
      expect(() => parseFinanceServiceCertificateCommand({ ...service(), [field]: id })).toThrow(FinanceInputError);
      expect(() => parseFinanceTerminalRecognitionCommand({ ...terminal(), [field]: id })).toThrow(FinanceInputError);
    }
  });
  it.each([null, [], 'command', new Date(), Object.assign(Object.create({ injected: true }) as object, service())])('rechaza estructura que no es objeto simple: %p', value => {
    expect(() => parseFinanceServiceCertificateCommand(value)).toThrow(FinanceInputError);
  });
  it('rechaza claves propias símbolo y no enumerables desconocidas', () => {
    expect(() => parseFinanceServiceCertificateCommand({ ...service(), [Symbol('actor')]: id })).toThrow(FinanceInputError);
    expect(() => parseFinanceServiceCertificateCommand(Object.defineProperty(service(), 'actor', { value: id }))).toThrow(FinanceInputError);
  });
  it.each(['2026-10-05T00:00:00Z', '2026-10-05T00:00:00.000+00:00', '2026-02-30T00:00:00.000Z', '2026-10-05T24:00:00.000Z', '0000-10-05T00:00:00.000Z'])('rechaza instante no exacto %s', expectedBookingUpdatedAt => {
    expect(() => parseFinanceServiceCertificateCommand({ ...service(), expectedBookingUpdatedAt })).toThrow(FinanceInputError);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0'])('rechaza versión inválida %p', expectedCertificateVersion => {
    expect(() => parseFinanceServiceCertificateCommand({ ...service(), expectedCertificateVersion })).toThrow(FinanceInputError);
  });
  it('exige referencia explícita concordante y permite reverso sólo con versión previa', () => {
    expect(() => parseFinanceServiceCertificateCommand({ ...service(), supersedesCertificateId: undefined })).toThrow(FinanceInputError);
    expect(() => parseFinanceServiceCertificateCommand({ ...service(), expectedCertificateVersion: 1 })).toThrow(FinanceInputError);
    expect(() => parseFinanceServiceCertificateCommand({ ...service(), supersedesCertificateId: id })).toThrow(FinanceInputError);
    expect(() => parseFinanceServiceCertificateCommand({ ...service(), servedNights: [] })).toThrow(FinanceInputError);
    expect(parseFinanceServiceCertificateCommand({ ...service(), expectedCertificateVersion: 1, supersedesCertificateId: id, servedNights: [] }).servedNights).toEqual([]);
  });
  it('rechaza UUID, fechas, controles, textos largos, noches duplicadas y límite excedido', () => {
    const patches: Record<string, unknown>[] = [{ bookingId: 'other' }, { expectedPricingSourceId: 'other' }, { effectiveCheckInOn: '2026-02-30' }, { effectiveCheckOutOn: '2026-08-01' }, { evidence: 'x'.repeat(501) }, { reason: ' Motivo\n' }, { servedNights: ['2026-09-01', '2026-09-01'] }, { servedNights: ['2026-02-30'] }, { servedNights: Array.from({ length: 367 }, () => '2026-09-01') }];
    for (const patch of patches) expect(() => parseFinanceServiceCertificateCommand({ ...service(), ...patch })).toThrow(FinanceInputError);
  });
  it('valida cobertura terminal, dinero seguro y versión de certificado', () => {
    expect(parseFinanceTerminalRecognitionCommand(terminal()).confirmedNonServiceAmountMinor).toBe(0);
    for (const patch of [{ coverage: 'INCOMPLETE' }, { confirmedNonServiceAmountMinor: -1 }, { confirmedNonServiceAmountMinor: 0.5 }, { expectedVersion: -1 }, { expectedPricingRevisionId: 'other' }, { serviceCertificateVersion: 1 }, { serviceCertificateId: id }]) {
      expect(() => parseFinanceTerminalRecognitionCommand({ ...terminal(), ...patch })).toThrow(FinanceInputError);
    }
  });
  it('valida rango inclusivo/exclusivo completo y token opcional sin aceptar asOf', () => {
    expect(parseFinanceProfitabilityQuery({ from: '2024-01-01', to: '2025-01-01', token })).toEqual({ from: '2024-01-01', to: '2025-01-01', expectedSourceToken: token });
    expect(parseFinanceProfitabilityQuery({ from: '2026-09-01', to: '2026-10-01' })).toEqual({ from: '2026-09-01', to: '2026-10-01' });
    for (const query of [{ from: '2024-01-01', to: '2025-01-02' }, { from: '2026-10-01', to: '2026-10-01' }, { from: '2026-10-01', to: '2026-09-01' }, { from: '2026-09-01', to: '2026-10-01', token: ['a', 'b'] }, { from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-01' }]) expect(() => parseFinanceProfitabilityQuery(query)).toThrow(FinanceInputError);
  });
  it('período abarca exactamente un mes incluso en diciembre o año bisiesto', () => {
    expect(parseFinanceCreatePeriodCommand({ from: '2024-02-01', to: '2024-03-01', reason: 'Mes.' }).to).toBe('2024-03-01');
    expect(parseFinanceCreatePeriodCommand({ from: '2026-12-01', to: '2027-01-01', reason: 'Mes.' }).to).toBe('2027-01-01');
    expect(() => parseFinanceCreatePeriodCommand({ from: '2026-09-02', to: '2026-10-02', reason: 'Mes.' })).toThrow(FinanceInputError);
    expect(() => parseFinanceCreatePeriodCommand({ from: '2026-09-01', to: '2026-11-01', reason: 'Mes.' })).toThrow(FinanceInputError);
  });
  it('acepta sólo motivos de excepción explícitos sin permitir reconocer integridad fallida', () => {
    const command = { expectedVersion: 1, expectedSourceToken: token, reason: 'Cerrar.' };
    expect(parseFinanceClosePeriodCommand(command).acknowledgements).toEqual({});
    expect(parseFinanceClosePeriodCommand({ ...command, acknowledgements: { EVIDENCE: ' Faltante revisado. ' } }).acknowledgements).toEqual({ EVIDENCE: 'Faltante revisado.' });
    for (const acknowledgements of [null, [], { SOURCES_COMPLETE: 'Aceptar' }, { EVIDENCE: '' }, { EVIDENCE: true }, { EVIDENCE: undefined }]) expect(() => parseFinanceClosePeriodCommand({ ...command, acknowledgements })).toThrow(FinanceInputError);
    expect(() => parseFinanceClosePeriodCommand({ ...command, expectedVersion: 0 })).toThrow(FinanceInputError);
    expect(() => parseFinanceClosePeriodCommand({ ...command, expectedSourceToken: 'hash' })).toThrow(FinanceInputError);
  });
  it('reapertura requiere versión y motivo y rechaza snapshot suministrado', () => {
    expect(parseFinanceReopenPeriodCommand({ expectedVersion: 2, reason: 'Reabrir.' })).toEqual({ expectedVersion: 2, reason: 'Reabrir.' });
    expect(() => parseFinanceReopenPeriodCommand({ expectedVersion: 0, reason: 'Reabrir.' })).toThrow(FinanceInputError);
    expect(() => parseFinanceReopenPeriodCommand({ expectedVersion: 2, reason: '' })).toThrow(FinanceInputError);
    expect(() => parseFinanceReopenPeriodCommand({ expectedVersion: 2, reason: 'Reabrir.', snapshotId: id })).toThrow(FinanceInputError);
  });
  it('clave de retry mantiene contrato V1 exacto y rechaza arrays de headers', () => {
    expect(parseFinanceRecognitionIdempotencyKey('request-1234567890')).toBe('request-1234567890');
    for (const value of [undefined, 'short', 'x'.repeat(129), ' key-123456789012 ', ['request-1234567890']]) expect(() => parseFinanceRecognitionIdempotencyKey(value)).toThrow(FinanceInputError);
  });
});
