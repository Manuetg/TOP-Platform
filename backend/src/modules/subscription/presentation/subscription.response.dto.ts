import { ApiProperty } from '@nestjs/swagger';
class PlanDto {
  @ApiProperty({ example: 'TOP_INITIAL' }) planCode!: string;
  @ApiProperty({ example: 'TOP Inicial' }) planName!: string;
}
class EntitlementsDto {
  @ApiProperty({ example: 10, minimum: 1 }) maxResources!: number;
}
class ResourceUsageDto {
  @ApiProperty() used!: number;
  @ApiProperty() available!: number;
  @ApiProperty({ description: 'Porcentaje entero; puede superar 100 para inventario previo superior al cupo.' }) percentage!: number;
  @ApiProperty({ enum: ['NORMAL', 'WARNING', 'LIMIT'] }) state!: 'NORMAL' | 'WARNING' | 'LIMIT';
  @ApiProperty() canCreate!: boolean;
}
class UsageDto { @ApiProperty({ type: ResourceUsageDto }) resources!: ResourceUsageDto; }
export class UpgradeResponseDto {
  @ApiProperty({ enum: ['AVAILABLE', 'REQUESTED'] }) status!: 'AVAILABLE' | 'REQUESTED';
  @ApiProperty({ nullable: true, format: 'date-time', type: String }) requestedAt!: string | null;
}
export class SubscriptionResponseDto {
  @ApiProperty({ type: PlanDto }) subscription!: PlanDto;
  @ApiProperty({ type: EntitlementsDto }) entitlements!: EntitlementsDto;
  @ApiProperty({ type: UsageDto }) usage!: UsageDto;
  @ApiProperty({ type: UpgradeResponseDto }) upgrade!: UpgradeResponseDto;
}
