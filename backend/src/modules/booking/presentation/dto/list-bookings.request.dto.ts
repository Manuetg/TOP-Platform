import { ApiPropertyOptional } from '@nestjs/swagger';
export class ListBookingsRequestDto { @ApiPropertyOptional() status?: string; @ApiPropertyOptional() contactId?: string; @ApiPropertyOptional() resourceId?: string; }
