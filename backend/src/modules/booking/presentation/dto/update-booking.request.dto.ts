import { PartialType } from '@nestjs/swagger';
import { CreateBookingRequestDto } from './create-booking.request.dto';
export class UpdateBookingRequestDto extends PartialType(CreateBookingRequestDto) {}
