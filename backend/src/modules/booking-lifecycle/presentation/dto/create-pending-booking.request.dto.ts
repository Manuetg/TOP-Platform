import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateBookingRequestDto } from '../../../booking/presentation/dto/create-booking.request.dto';
import { ConfirmBookingPricingItemRequestDto } from './confirm-booking.request.dto';

export class CreatePendingBookingRequestDto extends CreateBookingRequestDto {
  @ApiProperty({ type: [ConfirmBookingPricingItemRequestDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmBookingPricingItemRequestDto)
  pricing!: ConfirmBookingPricingItemRequestDto[];
}
