import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class ListBookingsRequestDto {
  @IsOptional() @ApiPropertyOptional() status?: string;
  @IsOptional() @ApiPropertyOptional() contactId?: string;
  @IsOptional() @ApiPropertyOptional() resourceId?: string;
}
