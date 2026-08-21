import { ApiProperty } from '@nestjs/swagger';
import { Block } from '../../domain/block.entity';

export class BlockResponseDto {
  @ApiProperty() id!: string; @ApiProperty() businessId!: string; @ApiProperty() resourceId!: string; @ApiProperty() type!: string; @ApiProperty() reason!: string; @ApiProperty({ nullable: true }) notes!: string | null; @ApiProperty() startsAt!: Date; @ApiProperty() endsAt!: Date; @ApiProperty() status!: string; @ApiProperty() effectiveStatus!: string; @ApiProperty({ nullable: true }) cancellationReason!: string | null; @ApiProperty({ nullable: true }) cancelledAt!: Date | null; @ApiProperty() createdAt!: Date; @ApiProperty() updatedAt!: Date;
  static fromDomain(block: Block): BlockResponseDto { return { id: block.id, businessId: block.businessId, resourceId: block.resourceId, type: block.type, reason: block.reason, notes: block.notes, startsAt: block.startsAt, endsAt: block.endsAt, status: block.status, effectiveStatus: block.effectiveStatus(), cancellationReason: block.cancellationReason, cancelledAt: block.cancelledAt, createdAt: block.createdAt, updatedAt: block.updatedAt }; }
}
