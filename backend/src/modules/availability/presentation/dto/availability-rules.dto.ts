import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class AvailabilityRulesResponseDto {
  @ApiProperty() businessId!: string;
  @ApiProperty() pendingBlocksAvailability!: boolean;
  @ApiProperty() bufferBeforeDays!: number;
  @ApiProperty() bufferAfterDays!: number;
}

export class UpdateAvailabilityRulesRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pendingBlocksAvailability?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) bufferBeforeDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) bufferAfterDays?: number;
}
