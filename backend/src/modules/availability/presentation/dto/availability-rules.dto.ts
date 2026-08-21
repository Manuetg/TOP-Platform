import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AvailabilityRulesResponseDto {
  @ApiProperty() businessId!: string;
  @ApiProperty() pendingBlocksAvailability!: boolean;
  @ApiProperty() bufferBeforeDays!: number;
  @ApiProperty() bufferAfterDays!: number;
}

export class UpdateAvailabilityRulesRequestDto {
  @ApiPropertyOptional() pendingBlocksAvailability?: boolean;
  @ApiPropertyOptional() bufferBeforeDays?: number;
  @ApiPropertyOptional() bufferAfterDays?: number;
}
