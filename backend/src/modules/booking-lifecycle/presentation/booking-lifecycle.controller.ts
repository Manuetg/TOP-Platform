import { BadRequestException, ConflictException, Controller, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BookingAvailabilityConflictError,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingContactNotFoundError,
  BookingContactRequiredError,
  BookingDatesRequiredError,
  BookingNotDraftError,
  BookingNotFoundError,
  BookingResourcesRequiredError,
  InvalidBookingInputError,
} from '../../booking/booking.contract';
import { BookingResponseDto } from '../../booking/presentation/dto/booking.response.dto';
import { SubmitBookingUseCase } from '../application/submit-booking.use-case';

@ApiTags('Bookings')
@Controller('businesses/:businessId/bookings')
export class BookingLifecycleController {
  constructor(private readonly submitBooking: SubmitBookingUseCase) {}

  @Post(':bookingId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submits a draft booking for availability validation.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async submit(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(await this.submitBooking.execute({ businessId, bookingId }));
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): Error {
    if (error instanceof InvalidBookingInputError) return new BadRequestException(error.message);
    if ([BookingBusinessNotFoundError, BookingContactNotFoundError, BookingNotFoundError].some((type) => error instanceof type)) return new NotFoundException((error as Error).message);
    if ([BookingBusinessUnavailableError, BookingNotDraftError, BookingContactRequiredError, BookingResourcesRequiredError, BookingDatesRequiredError, BookingAvailabilityConflictError].some((type) => error instanceof type)) return new ConflictException((error as Error).message);
    return error instanceof Error ? error : new Error('Error inesperado.');
  }
}
