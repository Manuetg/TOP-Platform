import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';
export class CreateSeasonalRateRequestDto { @ApiProperty() @IsString() name!: string; @ApiProperty() @IsInt() amountMinor!: number; @ApiProperty({example:'2026-12-20'}) @IsString() startDate!: string; @ApiProperty({example:'2027-01-06'}) @IsString() endDate!: string; }
