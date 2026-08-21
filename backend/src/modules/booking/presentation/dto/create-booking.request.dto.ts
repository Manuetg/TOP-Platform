import { ApiPropertyOptional } from '@nestjs/swagger';
export class CreateBookingRequestDto {
  @ApiPropertyOptional() contactId?: string | null;
  @ApiPropertyOptional({ type: [String] }) resourceIds?: string[];
  @ApiPropertyOptional({ example: '2026-12-20' }) checkInDate?: string | null;
  @ApiPropertyOptional({ example: '2026-12-22' }) checkOutDate?: string | null;
  @ApiPropertyOptional() adults?: number | null;
  @ApiPropertyOptional() children?: number | null;
  @ApiPropertyOptional() notes?: string | null;
}
