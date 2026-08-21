import { Block } from './block.entity';
import { BlockStatus, EffectiveBlockStatus } from './block-status.enum';
import { BlockType } from './block-type.enum';

const createBlock = (status = BlockStatus.SCHEDULED): Block => Block.create({ id: '11111111-1111-4111-8111-111111111111', businessId: '22222222-2222-4222-8222-222222222222', resourceId: '33333333-3333-4333-8333-333333333333', type: BlockType.OTHER, reason: 'Uso propio', notes: null, startsAt: new Date('2026-12-20T10:00:00Z'), endsAt: new Date('2026-12-21T10:00:00Z'), status, cancellationReason: status === BlockStatus.CANCELLED ? 'Original' : null, cancelledAt: status === BlockStatus.CANCELLED ? new Date('2026-01-01T00:00:00Z') : null, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') });

describe('Block', () => {
  it.each([
    ['2026-12-20T09:59:59.999Z', EffectiveBlockStatus.SCHEDULED],
    ['2026-12-20T10:00:00.000Z', EffectiveBlockStatus.ACTIVE],
    ['2026-12-20T12:00:00.000Z', EffectiveBlockStatus.ACTIVE],
    ['2026-12-21T10:00:00.000Z', EffectiveBlockStatus.FINISHED],
    ['2026-12-21T10:00:00.001Z', EffectiveBlockStatus.FINISHED],
  ])('derives effective status at temporal boundaries', (now, expected) => {
    expect(createBlock().effectiveStatus(new Date(now))).toBe(expected);
  });

  it('gives CANCELLED precedence and preserves cancellation history idempotently', () => {
    const cancelled = createBlock(BlockStatus.CANCELLED);
    expect(cancelled.effectiveStatus(new Date('2026-12-20T12:00:00Z'))).toBe(EffectiveBlockStatus.CANCELLED);
    expect(cancelled.cancel('Otro motivo', new Date('2026-02-01T00:00:00Z'))).toBe(cancelled);
    expect(cancelled.cancellationReason).toBe('Original');
    expect(cancelled.cancelledAt).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('cancels immutably and refuses finished blocks', () => {
    const original = createBlock(); const now = new Date('2026-01-01T00:00:00Z'); const cancelled = original.cancel('Cambio', now);
    expect(cancelled).not.toBe(original); expect(cancelled).toMatchObject({ status: BlockStatus.CANCELLED, cancellationReason: 'Cambio', cancelledAt: now, businessId: original.businessId, resourceId: original.resourceId, startsAt: original.startsAt, endsAt: original.endsAt });
    expect(() => createBlock().cancel('Cambio', new Date('2027-01-01T00:00:00Z'))).toThrow('BLOCK_FINISHED');
  });
});
