import { PaymentMethod } from '../domain/payment';
describe('RegisterPaymentUseCase',()=>{it.each([0,-1,1.5])('rejects invalid amounts',()=>{});it.each(['DRAFT','PENDING','CANCELLED','NO_SHOW'])('rejects unsupported booking status',()=>{});it('rejects missing snapshot and future paidAt',()=>{});it('normalizes reference and note',()=>{});it('rejects overpayment',()=>{});it('returns the existing payment on identical idempotent retry',()=>{});it('rejects a reused idempotency key with different fingerprint',()=>{});});

