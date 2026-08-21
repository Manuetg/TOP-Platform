import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
export class CreateBookingRequestDto {
  @IsOptional() @ApiPropertyOptional() contactId?: string | null;
  @IsOptional() @ApiPropertyOptional({ type: [String] }) resourceIds?: string[];
  @IsOptional() @ApiPropertyOptional({ example: '2026-12-20' }) checkInDate?: string | null;
  @IsOptional() @ApiPropertyOptional({ example: '2026-12-22' }) checkOutDate?: string | null;
  @IsOptional() @ApiPropertyOptional() adults?: number | null;
  @IsOptional() @ApiPropertyOptional() children?: number | null;
  @IsOptional() @ApiPropertyOptional() notes?: string | null;
}
