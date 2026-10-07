import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { FinanceCorrectionBooking, FinanceCorrectionsData } from '../../../src/modules/finance/domain/finance-corrections.types';
import type { FinanceReport } from '../../../src/modules/finance/domain/finance.types';
import type { ExpenseDefinition, FinanceBankMatchSourceDto, BankMatchComponentInput, FinanceBankStatementDto, FinanceV2Page } from '../../../src/modules/finance/domain/finance-v2.types';
import { HISTORY_CSV_HEADER } from '../../../src/modules/finance/application/finance-v2-import.parser';
import { financePeriod, type FinanceFixture } from '../../fixtures/finance-fixture';
import { TopWorld } from '../support/world';

// Reutiliza exclusivamente el harness @financeReal de finance-v1.steps, sin hooks ni overrides.
export interface FinanceV2AcceptanceWorld extends TopWorld {
  financePrisma: PrismaClient; financeFixture: FinanceFixture; financeToken: string;
  v2AccountId: string; v2BookingId: string; v2PaymentId: string; v2BookingCount?: number;
  v2OriginalFacts: string; v2LegacyFingerprint: string; v2Csv: string; v2PreviewToken: string;
  v2SourceNamespace: string; v2DraftId: string; v2TemplateId: string; v2PolicyId: string;
  v2SecondToken: string; v2SecondOwnerId: string; v2TemplateRevisionId: string;
  v2ExpenseId: string; v2StatementId: string; v2MatchId: string;
  v2RequestCount: number;
  v2PaymentIds: string[];
}

export function financeRoot(world: FinanceV2AcceptanceWorld): string {
  return `/api/businesses/${world.financeFixture.business.id}/finance`;
}

export function v2Get(world: FinanceV2AcceptanceWorld, path: string, token = world.financeToken) {
  return request(world.app!.getHttpServer()).get(`${financeRoot(world)}/${path}`).set('Authorization', `Bearer ${token}`);
}

export function v2Post(world: FinanceV2AcceptanceWorld, path: string, body: object, key: string = randomUUID(), token = world.financeToken) {
  return request(world.app!.getHttpServer()).post(`${financeRoot(world)}/${path}`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
}

export function v2Command(world: FinanceV2AcceptanceWorld, body: object, key: string = randomUUID(), token = world.financeToken) {
  return v2Post(world, 'v2/commands', body, key, token);
}

export async function v2Report(world: FinanceV2AcceptanceWorld): Promise<FinanceReport> {
  return (await v2Get(world, '').query(financePeriod).expect(200)).body as FinanceReport;
}

export function costDefinition(world: FinanceV2AcceptanceWorld, amountMinor: number): ExpenseDefinition {
  return { description: 'Consumo sintético verificable', counterpartyId: world.financeFixture.counterparty.id, reference: null, amountMinor,
    lines: [{ label: 'Costo de origen', categoryId: world.financeFixture.category.id, resourceId: world.financeFixture.resource.id, bookingId: null, amountMinor, operational: true }] };
}

export async function createV2Bank(world: FinanceV2AcceptanceWorld, openingMinor: number | null): Promise<string> {
  const response = await v2Post(world, 'commands', { type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco propio sintético de aceptación',
    opening: openingMinor === null ? null : { amountMinor: openingMinor, occurredAt: '2026-10-01T00:00:00Z', reason: 'Saldo de apertura explícito.' } }).expect(200);
  return response.body.id as string;
}

export function historyCsvRow(input: Partial<Record<typeof HISTORY_CSV_HEADER[number], string>>): string {
  return HISTORY_CSV_HEADER.map(column => `"${(input[column] ?? '').replaceAll('"', '""')}"`).join(',');
}

export async function originalPaymentFacts(world: FinanceV2AcceptanceWorld): Promise<string> {
  const rows = await Promise.all([
    world.financePrisma.payment.findUniqueOrThrow({ where: { id: world.v2PaymentId } }),
    world.financePrisma.pricingSnapshot.findUniqueOrThrow({ where: { bookingId: world.v2BookingId } }),
    world.financePrisma.paymentApplication.findMany({ where: { paymentId: world.v2PaymentId }, orderBy: { installmentId: 'asc' } }),
  ]);
  return JSON.stringify(rows, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
}

export async function paidBooking(world: FinanceV2AcceptanceWorld, totalMinor: number, paidMinor: number): Promise<{ bookingId: string; paymentId: string }> {
  const fixture = world.financeFixture;
  const contact = await world.financePrisma.contact.create({ data: { businessId: fixture.business.id, name: `Huésped sintético ${randomUUID()}` } });
  const day = 20 + (world.v2BookingCount ?? 0) * 3;
  world.v2BookingCount = (world.v2BookingCount ?? 0) + 1;
  const body = { contactId: contact.id, resourceIds: [fixture.resource.id], checkInDate: `2026-09-${day}`, checkOutDate: `2026-09-${day + 2}`, adults: 1, children: 0,
    pricing: [{ resourceId: fixture.resource.id, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: totalMinor, overrideReason: 'Importe original acordado del fixture sintético.' }] };
  const booking = await request(world.app!.getHttpServer()).post(`/api/businesses/${fixture.business.id}/bookings/pending`).set('Authorization', `Bearer ${world.financeToken}`).send(body).expect(201);
  const bookingId = booking.body.id as string;
  // Plan y cuota originales son bootstrap del fixture; el cobro y su aplicación pasan por Payment HTTP.
  await world.financePrisma.paymentPlan.create({ data: { businessId: fixture.business.id, bookingId, currency: 'PYG', totalAmountMinor: totalMinor,
    createdByUserId: fixture.users.OWNER.id, updatedByUserId: fixture.users.OWNER.id, installments: { create: { amountMinor: totalMinor, sortOrder: 1 } } } });
  const payment = await request(world.app!.getHttpServer()).post(`/api/businesses/${fixture.business.id}/bookings/${bookingId}/payments`).set('Authorization', `Bearer ${world.financeToken}`).set('Idempotency-Key', randomUUID())
    .send({ amountMinor: paidMinor, method: 'BANK_TRANSFER', paidAt: '2026-10-01T12:00:00Z', reference: 'Cobro original externo sintético.' }).expect(201);
  return { bookingId, paymentId: payment.body.id as string };
}

export async function selectedCorrection(world: FinanceV2AcceptanceWorld): Promise<FinanceCorrectionBooking> {
  const result = (await v2Get(world, 'corrections').expect(200)).body as FinanceCorrectionsData;
  const booking = result.bookings.find(item => item.bookingId === world.v2BookingId);
  assert.ok(booking, 'La consulta debe identificar la reserva original del negocio autorizado.');
  return booking;
}

export async function bankSources(world: FinanceV2AcceptanceWorld): Promise<FinanceBankMatchSourceDto[]> {
  return (await v2Get(world, 'v2/bank-match-sources').query({ accountId: world.v2AccountId }).expect(200)).body as FinanceBankMatchSourceDto[];
}

export function bankComponent(source: FinanceBankMatchSourceDto, amountMinor = source.residualMinor): BankMatchComponentInput {
  assert.match(source.sourceHash, /^[0-9a-f]{64}$/u);
  return { ...source.ref, sourceVersion: source.sourceVersion, sourceHash: source.sourceHash, amountMinor };
}

export async function selectedStatement(world: FinanceV2AcceptanceWorld): Promise<FinanceBankStatementDto> {
  const page = (await v2Get(world, 'v2/bank-statements').query({ limit: 100 }).expect(200)).body as FinanceV2Page<FinanceBankStatementDto>;
  const statement = page.items.find(item => item.id === world.v2StatementId);
  assert.ok(statement, 'El extracto confirmado debe ser consultable en el mismo negocio.');
  return statement;
}
