import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
export class BookingTimelinePathParamsDto { @ApiProperty({format:'uuid'}) @IsUUID() businessId!:string; @ApiProperty({format:'uuid'}) @IsUUID() bookingId!:string; }
