import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import type { MembershipRole, PrismaClient } from '@prisma/client';
import request, { type Response, type Test } from 'supertest';
import type { FinanceEvidenceMetadataDto } from '../../../src/modules/finance/domain/finance-evidence.types';
import { expenseCommand, realFinanceToken, type FinanceFixture } from '../../fixtures/finance-fixture';
import { evidencePdf, evidencePng, evidenceHash, exactLimitEvidencePdf, ownedFilesProviderFixture, ownEvidenceKeys, removeOwnEvidenceKeys, type FilesProviderFixture } from '../../integration/support/finance-evidence-files.fixture';
import { TopWorld } from '../support/world';

interface EvidenceWorld extends TopWorld {
  financePrisma: PrismaClient; financeFixture: FinanceFixture; financeToken: string;
  fvExpenseId: string; fvKey: string; fvFilename: string; fvBytes: Buffer; fvFirst: Response;
  fvFile: FinanceEvidenceMetadataDto; fvResponses: Response[]; fvProvider: FilesProviderFixture;
}
const root = (world: EvidenceWorld, businessId = world.financeFixture.business.id): string => `/api/businesses/${businessId}/finance`;
const path = (world: EvidenceWorld): string => `${root(world)}/expenses/${world.fvExpenseId}/evidence`;
function get(world: EvidenceWorld, url: string, token = world.financeToken): Test { return request(world.app!.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`); }
function upload(world: EvidenceWorld, bytes = world.fvBytes, version = '1', key = world.fvKey, token = world.financeToken, mimeType = 'application/pdf'): Test {
  return request(world.app!.getHttpServer()).post(path(world)).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).field('expectedVersion', version).attach('file', bytes, { filename: world.fvFilename, contentType: mimeType });
}
async function oneFile(world: EvidenceWorld): Promise<void> {
  assert.equal(await world.financePrisma.financeEvidenceFile.count(), 1);
  assert.equal(await world.financePrisma.financeRequest.count({ where: { operation: 'UPLOAD_FINANCE_EVIDENCE' } }), 1);
  assert.equal((await world.financePrisma.financeExpense.findUniqueOrThrow({ where: { id: world.fvExpenseId } })).version, 2);
  assert.equal((await ownEvidenceKeys(world.fvProvider, world.financeFixture.business.id)).length, 1);
}
function noMetadata(response: Response): void {
  for (const field of ['file', 'files', 'sha256', 'storageKey', 'filename']) assert.equal(Object.hasOwn(response.body, field), false);
}
Given('FV existe un gasto propio sin evidencia y el proveedor privado sintético autorizado', { timeout: 20000 }, async function (this: EvidenceWorld) {
  assert.ok(this.app && this.financePrisma && this.financeToken);
  this.fvProvider = await ownedFilesProviderFixture();
  const response = await request(this.app.getHttpServer()).post(`${root(this)}/commands`).set('Authorization', `Bearer ${this.financeToken}`).set('Idempotency-Key', randomUUID()).send(expenseCommand(this.financeFixture)).expect(200);
  this.fvExpenseId = response.body.id as string; this.fvBytes = evidencePdf; this.fvFilename = 'proof.pdf'; this.fvKey = randomUUID();
  assert.equal(await this.financePrisma.financeEvidenceFile.count(), 0);
});
When('FV sube el PDF como {string} y repite la misma intención', { timeout: 20000 }, async function (this: EvidenceWorld, filename: string) {
  this.fvFilename = filename; this.fvFirst = await upload(this).expect(200); this.fvFile = this.fvFirst.body.file as FinanceEvidenceMetadataDto;
  const repeated = await upload(this).expect(200); assert.deepEqual(repeated.body, this.fvFirst.body);
});
Given('FV el OWNER ya incorporó el PDF privado', async function (this: EvidenceWorld) {
  this.fvFirst = await upload(this).expect(200); this.fvFile = this.fvFirst.body.file as FinanceEvidenceMetadataDto;
});
Then('FV conserva un archivo con hash exacto versión de gasto 2 y metadatos privados', async function (this: EvidenceWorld) {
  await oneFile(this);
  assert.equal(this.fvFile.sha256, evidenceHash(this.fvBytes)); assert.equal(this.fvFile.sizeBytes, this.fvBytes.length);
  assert.equal(this.fvFile.expenseVersion, 2); assert.equal(this.fvFile.recordedByUserId, this.financeFixture.users.OWNER.id); assert.equal(this.fvFile.filename, this.fvFilename);
  const result = await get(this, path(this)).expect(200); assert.deepEqual(result.body.files, [this.fvFile]);
  assert.equal(result.body.enabled, true); assert.equal(result.body.retention, 'PRESERVE_WITHOUT_PURGE'); assert.equal(result.body.fileSizeLimitBytes, 2097152);
  assert.equal(/storageKey|bucket|https?:|idempotencyKey|fingerprint/u.test(JSON.stringify([this.fvFirst.body, result.body])), false);
});
Then('FV descarga los mismos bytes con nombre original y headers privados', { timeout: 20000 }, async function (this: EvidenceWorld) {
  const value = await get(this, `${root(this)}/evidence/${this.fvFile.id}/download`).buffer(true).parse((response, done) => {
    const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks)));
  }).expect(200);
  assert.deepEqual(value.body, this.fvBytes); assert.equal(value.headers['content-length'], String(this.fvBytes.length)); assert.equal(value.headers['cache-control'], 'private, no-store'); assert.equal(value.headers['x-content-type-options'], 'nosniff');
  assert.equal(decodeURIComponent(String(value.headers['content-disposition']).split("filename*=UTF-8''")[1]), this.fvFilename);
});
Then('FV la referencia del gasto sigue vacía y su evidencia actual ya está cubierta', async function (this: EvidenceWorld) {
  assert.equal((await this.financePrisma.financeExpense.findUniqueOrThrow({ where: { id: this.fvExpenseId } })).reference, null);
  const report = await get(this, root(this)).query({ from: '2026-09-01', to: '2026-11-01' }).expect(200);
  assert.equal(report.body.expenses.find((row: { id: string }) => row.id === this.fvExpenseId).evidenceMissing, false);
});
When('FV sube un PDF válido de exactamente 2097152 bytes', { timeout: 30000 }, async function (this: EvidenceWorld) {
  this.fvBytes = exactLimitEvidencePdf(); assert.equal(this.fvBytes.length, 2097152); this.fvFirst = await upload(this).expect(200); this.fvFile = this.fvFirst.body.file as FinanceEvidenceMetadataDto;
  assert.equal(this.fvFile.sha256, evidenceHash(this.fvBytes)); assert.equal(this.fvFile.sizeBytes, 2097152);
});
When('FV intenta otro archivo de 2097153 bytes con la versión actual', { timeout: 30000 }, async function (this: EvidenceWorld) {
  this.response = await upload(this, Buffer.concat([this.fvBytes, Buffer.from(' ')]), '2', randomUUID());
});
Then('FV recibe 413 y conserva un archivo una request y versión 2', async function (this: EvidenceWorld) { assert.equal(this.response!.status, 413); await oneFile(this); });
When('FV presenta PNG como PDF', async function (this: EvidenceWorld) { this.response = await upload(this, evidencePng); });
Then('FV recibe 400 sin archivo objeto ni incremento de versión', async function (this: EvidenceWorld) {
  assert.equal(this.response!.status, 400); assert.equal(await this.financePrisma.financeEvidenceFile.count(), 0);
  assert.equal(await this.financePrisma.financeRequest.count({ where: { operation: 'UPLOAD_FINANCE_EVIDENCE' } }), 0);
  assert.equal((await this.financePrisma.financeExpense.findUniqueOrThrow({ where: { id: this.fvExpenseId } })).version, 1); assert.equal((await ownEvidenceKeys(this.fvProvider, this.financeFixture.business.id)).length, 0);
});
When('FV un usuario {word} intenta listar descargar y subir evidencia', async function (this: EvidenceWorld, role: MembershipRole) {
  const token = await realFinanceToken(this.app!, this.financeFixture.users[role].id);
  this.fvResponses = [await get(this, path(this), token), await get(this, `${root(this)}/evidence/${this.fvFile.id}/download`, token), await upload(this, this.fvBytes, '2', randomUUID(), token)];
});
Then('FV las tres acciones responden 403 sin metadatos ni archivo adicional', async function (this: EvidenceWorld) {
  assert.deepEqual(this.fvResponses.map(value => value.status), [403, 403, 403]); this.fvResponses.forEach(noMetadata); await oneFile(this);
});
When('FV el OWNER ajeno consulta ese ID en su negocio y otro cliente omite JWT', async function (this: EvidenceWorld) {
  const token = await realFinanceToken(this.app!, this.financeFixture.foreignOwner.id), url = `${root(this, this.financeFixture.foreignBusiness.id)}/evidence/${this.fvFile.id}/download`;
  this.fvResponses = [await get(this, url, token), await get(this, `${root(this, this.financeFixture.foreignBusiness.id)}/evidence/${randomUUID()}/download`, token), await request(this.app!.getHttpServer()).get(`${root(this)}/evidence/${this.fvFile.id}/download`)];
});
Then('FV observa 404 equivalente al ID inexistente y 401 anónimo sin bytes', async function (this: EvidenceWorld) {
  assert.deepEqual(this.fvResponses.map(value => value.status), [404, 404, 401]); assert.deepEqual(this.fvResponses[0].body, this.fvResponses[1].body); this.fvResponses.forEach(noMetadata); await oneFile(this);
});
When('FV revoca su membresía y conserva el JWT anterior', async function (this: EvidenceWorld) {
  await this.financePrisma.userBusinessMembership.delete({ where: { userId_businessId: { userId: this.financeFixture.users.OWNER.id, businessId: this.financeFixture.business.id } } });
});
Then('FV descarga y replay responden 403 y el archivo privado permanece', async function (this: EvidenceWorld) {
  const values = [await get(this, `${root(this)}/evidence/${this.fvFile.id}/download`), await upload(this)];
  assert.deepEqual(values.map(value => value.status), [403, 403]); values.forEach(noMetadata); await oneFile(this);
});
When('FV reintenta la misma clave con otro PDF válido', async function (this: EvidenceWorld) {
  const changed = Buffer.from('%PDF-1.4\n% otro soporte sintético\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n');
  assert.notEqual(evidenceHash(changed), this.fvFile.sha256); this.response = await upload(this, changed);
});
Then('FV recibe 409 con un archivo y su hash original intactos', async function (this: EvidenceWorld) {
  assert.equal(this.response!.status, 409); await oneFile(this); assert.equal((await this.financePrisma.financeEvidenceFile.findUniqueOrThrow({ where: { id: this.fvFile.id } })).sha256, evidenceHash(this.fvBytes));
});
Then('FV elimina sólo los objetos descartables de su fixture sintético', { timeout: 20000 }, async function (this: EvidenceWorld) {
  try { await removeOwnEvidenceKeys(this.fvProvider, this.financeFixture.business.id); }
  finally { this.fvProvider.client.destroy(); }
});
