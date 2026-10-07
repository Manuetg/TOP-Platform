import { recognitionDate, recognitionInstant, recognitionMoney, recognitionRequire, recognitionSafe, recognitionStay, recognitionText, recognitionVersion } from './finance-recognition.support';
import type { CertifyServiceCommand, RecognitionContext, RecognitionHead, RecognitionNight, RecognitionPolicy, ServiceCertificate, ServicePricingBasis, TerminalRecognitionInput, TerminalRecognitionPlan } from './finance-recognition.types';

export function agreedNightPrices(pricing: ServicePricingBasis): { policyVersion: RecognitionPolicy; nights: RecognitionNight[] } {
  assertPricingSource(pricing);
  const dates = recognitionStay(pricing.checkInDate, pricing.checkOutDate);
  recognitionRequire(dates.length === pricing.nights, 'PRICING_COVERAGE_INCOMPLETE', 'Las noches del precio no cubren la estancia acordada.');
  if (pricing.mode === 'MANUAL_NO_RATE_PLAN') {
    recognitionRequire(pricing.breakdown.length === 0 && pricing.suggestedAmountMinor === null && pricing.adjustmentAmountMinor === null, 'PRICING_SOURCE_INVALID', 'Manual sin plan no contiene una tarifa sugerida.');
    recognitionText(pricing.overrideReason ?? '');
    return { policyVersion: 'EQUAL_AGREED_NIGHTS_V1', nights: distributeAgreement(dates, dates.map(() => 1), pricing.agreedAmountMinor) };
  }
  recognitionRequire(pricing.mode === 'CALCULATED' || pricing.mode === 'MANUAL_OVERRIDE', 'UNSUPPORTED_SERVICE_UNIT', 'El modo de precio no está soportado para noches.');
  const { weights, suggested } = readBreakdownWeights(pricing, dates);
  if (pricing.mode === 'CALCULATED') {
    recognitionRequire(suggested === pricing.agreedAmountMinor && pricing.adjustmentAmountMinor === 0, 'PRICING_SOURCE_INVALID', 'El precio calculado debe conservar su breakdown.');
    return { policyVersion: 'BREAKDOWN_BY_DATE_V1', nights: dates.map((localNight, index) => ({ localNight, amountMinor: weights[index] })) };
  }
  recognitionText(pricing.overrideReason ?? '');
  return { policyVersion: 'WEIGHTED_AGREED_NIGHTS_V1', nights: distributeAgreement(dates, weights, pricing.agreedAmountMinor) };
}

function distributeAgreement(dates: string[], weights: number[], amountMinor: number): RecognitionNight[] {
  const denominator = weights.reduce((sum, value) => sum + BigInt(value), 0n);
  if (denominator === 0n) {
    recognitionRequire(amountMinor === 0, 'PRICING_WEIGHTS_UNAVAILABLE', 'El total positivo no puede distribuirse con pesos cero.');
    return dates.map(localNight => ({ localNight, amountMinor: 0 }));
  }
  const rows = dates.map((localNight, index) => {
    const numerator = BigInt(amountMinor) * BigInt(weights[index]);
    return { localNight, amount: numerator / denominator, remainder: numerator % denominator };
  });
  const rest = recognitionSafe(BigInt(amountMinor) - rows.reduce((sum, row) => sum + row.amount, 0n));
  const rank = [...rows].sort((left, right) => left.remainder === right.remainder ? (left.localNight < right.localNight ? -1 : 1) : left.remainder > right.remainder ? -1 : 1);
  for (let index = 0; index < rest; index += 1) rank[index].amount += 1n;
  return rows.map(row => ({ localNight: row.localNight, amountMinor: recognitionSafe(row.amount) }));
}

type CertificateInput = { id: string; businessId: string; actorUserId: string; recordedAt: string; command: CertifyServiceCommand; context: RecognitionContext; head: RecognitionHead | null };
export function planServiceCertificate(input: CertificateInput): ServiceCertificate {
  const { command, context, head } = input;
  const { booking, pricing } = context;
  assertCertificateIdentity(input);
  const reason = recognitionText(command.reason); const evidence = recognitionText(command.evidence);
  recognitionRequire(isNightArray(command.servedNights), 'INVALID_UNITS', 'Se requieren noches declaradas explícitamente.');
  // Reverso completo conserva la procedencia original y puede corregir una fuente que dejó de ser válida.
  if (command.servedNights.length === 0) {
    recognitionRequire(head, 'EMPTY_INITIAL_CERTIFICATE', 'Un reverso necesita un certificado anterior.');
    return { ...structuredClone(head.certificate), id: input.id, version: recognitionVersion(head.version + 1, 1), supersedesCertificateId: head.id, recordedByUserId: input.actorUserId, recordedAt: input.recordedAt, reason, evidence, units: [] };
  }
  const checkInEventId = assertEffectiveServiceStay(command, context);
  const full = agreedNightPrices(pricing);
  const units = selectServedNights(command, context.localToday, full.nights);
  return { id: input.id, businessId: input.businessId, bookingId: command.bookingId, resourceId: pricing.resourceId, version: recognitionVersion((head?.version ?? 0) + 1, 1), supersedesCertificateId: head?.id ?? null, recordedByUserId: input.actorUserId, recordedAt: input.recordedAt, bookingUpdatedAt: booking.bookingUpdatedAt, effectiveCheckInOn: command.effectiveCheckInOn, effectiveCheckOutOn: command.effectiveCheckOutOn, checkInEventId, checkOutEventId: booking.checkOutEventId, pricing: structuredClone(pricing), policyVersion: full.policyVersion, servicePolicyVersion: 'NIGHT_SERVICE_V1', evidence, reason, units };
}

export function planTerminalRecognition(input: TerminalRecognitionInput, head: RecognitionHead | null, localToday: string): TerminalRecognitionPlan {
  assertTerminalSource(input, head, localToday);
  const service = recognitionSafe((head?.certificate.units ?? []).reduce((sum, unit) => sum + BigInt(recognitionMoney(unit.amountMinor)), 0n));
  recognitionRequire(input.coverage !== 'DECLARED_NONE' || service === 0, 'TERMINAL_COVERAGE_CONFLICT', 'No puede declararse ausencia de servicio con noches reconocidas.');
  recognitionRequire(input.finalAmountMinor >= service, 'TERMINAL_SERVICE_EXCEEDS_FINAL', 'El final es menor que el servicio; requiere corrección explícita.');
  recognitionRequire(BigInt(service) + BigInt(input.confirmedNonServiceAmountMinor) === BigInt(input.finalAmountMinor), 'TERMINAL_AMOUNT_CONFLICT', 'Servicio más partida no servicio deben reproducir el final una vez.');
  return { ...input, serviceAmountMinor: service };
}

function assertPricingSource(pricing: ServicePricingBasis): void {
  recognitionRequire(pricing.currency === 'PYG', 'UNSUPPORTED_CURRENCY', 'La fuente debe estar en PYG.');
  recognitionMoney(pricing.agreedAmountMinor);
  recognitionMoney(pricing.totalAmountMinor);
  recognitionRequire(pricing.totalAmountMinor === pricing.agreedAmountMinor, 'PRICING_SOURCE_INVALID', 'El único item SERVICE debe reproducir el total fijado.');
  recognitionVersion(pricing.revisionNumber);
  recognitionRequire(pricing.sourceHash.length > 0 && pricing.originalSnapshotId.length > 0, 'PRICING_SOURCE_UNAVAILABLE', 'La fuente requiere procedencia fijada.');
  recognitionRequire(pricing.revisionNumber === 0 ? pricing.serviceRevisionId === null && pricing.sourceId === pricing.originalSnapshotId : pricing.serviceRevisionId === pricing.sourceId, 'PRICING_SOURCE_INVALID', 'La revisión SERVICE no coincide con su procedencia.');
}
function readBreakdownWeights(pricing: ServicePricingBasis, dates: string[]): { weights: number[]; suggested: number } {
  const byDate = new Map<string, number>();
  for (const item of pricing.breakdown) {
    recognitionDate(item.date); recognitionMoney(item.amountMinor);
    recognitionRequire(dates.includes(item.date) && !byDate.has(item.date), 'PRICING_COVERAGE_INCOMPLETE', 'El breakdown contiene fechas duplicadas o ajenas a la estancia.');
    byDate.set(item.date, item.amountMinor);
  }
  recognitionRequire(byDate.size === dates.length, 'PRICING_COVERAGE_INCOMPLETE', 'Faltan fechas reales en el breakdown.');
  const weights = dates.map(date => byDate.get(date)!);
  const suggested = recognitionSafe(weights.reduce((sum, value) => sum + BigInt(value), 0n));
  recognitionRequire(pricing.suggestedAmountMinor === suggested && Number.isSafeInteger(pricing.adjustmentAmountMinor) && BigInt(pricing.agreedAmountMinor) - BigInt(suggested) === BigInt(pricing.adjustmentAmountMinor!), 'PRICING_SOURCE_INVALID', 'El precio acordado, sugerido y ajuste no conservan sus importes.');
  return { weights, suggested };
}
function assertCertificateIdentity(input: CertificateInput): void {
  const { command, context, head } = input; const { booking, pricing } = context;
  recognitionRequire(input.id.length > 0 && input.id !== head?.id, 'CERTIFICATE_ID_CONFLICT', 'Una versión nueva requiere otro identificador de certificado.');
  recognitionInstant(input.recordedAt); recognitionInstant(command.expectedBookingUpdatedAt); recognitionDate(context.localToday);
  recognitionVersion(command.expectedCertificateVersion);
  recognitionRequire(booking.businessId === input.businessId && pricing.businessId === input.businessId && booking.bookingId === command.bookingId && pricing.bookingId === command.bookingId, 'SOURCE_SCOPE_MISMATCH', 'Todas las fuentes deben pertenecer al mismo Negocio y reserva.');
  recognitionRequire(booking.bookingUpdatedAt === command.expectedBookingUpdatedAt && pricing.sourceId === command.expectedPricingSourceId, 'SOURCE_VERSION_CONFLICT', 'La reserva o su precio SERVICE cambiaron.');
  assertCertificateHead(input);
}
function assertEffectiveServiceStay(command: CertifyServiceCommand, context: RecognitionContext): string {
  const { booking, pricing } = context;
  recognitionRequire(booking.resourceIds.length === 1 && booking.resourceIds[0] === pricing.resourceId && pricing.resourceId.length > 0, 'UNSUPPORTED_SERVICE_UNIT', 'Alojamiento requiere exactamente un Resource coherente.');
  recognitionRequire(booking.checkInDate === pricing.checkInDate && booking.checkOutDate === pricing.checkOutDate, 'PRICING_CONTEXT_CONFLICT', 'El precio SERVICE no corresponde a la estancia acordada.');
  recognitionRequire(['IN_PROGRESS', 'COMPLETED'].includes(booking.status) && booking.checkInEventId, 'SERVICE_EVIDENCE_UNAVAILABLE', 'La prestación requiere un ingreso manual registrado y operación compatible.');
  recognitionDate(command.effectiveCheckInOn);
  recognitionRequire(command.effectiveCheckInOn >= booking.checkInDate && command.effectiveCheckInOn < booking.checkOutDate && command.effectiveCheckInOn <= context.localToday, 'INVALID_EFFECTIVE_STAY', 'El ingreso efectivo debe estar dentro de la estancia y no ser futuro.');
  assertEffectiveCheckout(command, context);
  return booking.checkInEventId;
}
function selectServedNights(command: CertifyServiceCommand, localToday: string, nights: RecognitionNight[]): RecognitionNight[] {
  const byDate = new Map(nights.map(unit => [unit.localNight, unit]));
  const seen = new Set<string>();
  const units = command.servedNights.map(localNight => {
    recognitionDate(localNight);
    recognitionRequire(!seen.has(localNight) && byDate.has(localNight) && localNight >= command.effectiveCheckInOn && (command.effectiveCheckOutOn === null || localNight < command.effectiveCheckOutOn) && localNight < localToday, 'INVALID_SERVED_NIGHT', 'La noche es duplicada, no ha terminado o es ajena al tramo de prestación declarado.');
    seen.add(localNight);
    return { ...byDate.get(localNight)! };
  }).sort((left, right) => left.localNight < right.localNight ? -1 : 1);
  return units;
}
function assertTerminalSource(input: TerminalRecognitionInput, head: RecognitionHead | null, localToday: string): void {
  recognitionRequire(input.sourceKind === 'TERMINAL_FINAL_AMOUNT' && ['CANCELLED', 'NO_SHOW'].includes(input.bookingStatus), 'TERMINAL_SOURCE_UNAVAILABLE', 'La fuente debe ser una confirmación final de cancelación o no-show.');
  if (head) assertLinkedHead(head, input.businessId, input.bookingId);
  recognitionDate(input.recognitionOn); recognitionDate(localToday);
  recognitionRequire(input.recognitionOn <= localToday, 'INVALID_RECOGNITION_DATE', 'La confirmación terminal no puede ser futura.');
  recognitionMoney(input.finalAmountMinor); recognitionMoney(input.confirmedNonServiceAmountMinor);
  recognitionText(input.classification); recognitionText(input.reason);
  recognitionRequire(input.terminalAdjustmentId.length > 0 && input.terminalSourceHash.length > 0, 'TERMINAL_SOURCE_UNAVAILABLE', 'Se requiere un importe final confirmado con fuente.');
  recognitionRequire(input.coverage === 'COMPLETE' || input.coverage === 'DECLARED_NONE', 'TERMINAL_COVERAGE_INCOMPLETE', 'La cobertura de servicio debe declararse completa.');
  recognitionRequire((head?.id ?? null) === input.serviceCertificateId && (head?.version ?? 0) === input.serviceCertificateVersion, 'CERTIFICATE_VERSION_CONFLICT', 'La confirmación debe vincular el certificado efectivo.');
}

function assertLinkedHead(head: RecognitionHead, businessId: string, bookingId: string): void {
  recognitionRequire(head.certificate.businessId === businessId && head.certificate.bookingId === bookingId && head.certificate.id === head.id && head.certificate.version === head.version, 'SOURCE_SCOPE_MISMATCH', 'El head no corresponde a la reserva y version.');
}

function isNightArray(value: unknown): boolean { return Array.isArray(value); }

function assertCertificateHead(input: CertificateInput): void {
  const { command, head } = input;
  recognitionRequire((head?.version ?? 0) === command.expectedCertificateVersion && (head?.id ?? null) === command.supersedesCertificateId, 'CERTIFICATE_VERSION_CONFLICT', 'La versión efectiva del certificado cambió.');
  if (head) assertLinkedHead(head, input.businessId, command.bookingId);
}

function assertEffectiveCheckout(command: CertifyServiceCommand, context: RecognitionContext): void {
  const { booking } = context;
  if (command.effectiveCheckOutOn !== null) {
    recognitionDate(command.effectiveCheckOutOn);
    recognitionRequire(booking.checkOutEventId && command.effectiveCheckOutOn > command.effectiveCheckInOn && command.effectiveCheckOutOn <= booking.checkOutDate && command.effectiveCheckOutOn <= context.localToday, 'INVALID_EFFECTIVE_STAY', 'La salida efectiva requiere evidencia y fecha válida no futura.');
  }
  recognitionRequire(booking.status !== 'COMPLETED' || (booking.checkOutEventId && command.effectiveCheckOutOn), 'SERVICE_EVIDENCE_UNAVAILABLE', 'Una estancia completada requiere salida efectiva declarada.');
}
