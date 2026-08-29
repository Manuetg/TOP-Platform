import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  BookingAvailabilityConflictError,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingContactNotFoundError,
  BookingContactRequiredError,
  BookingCancellationNotAllowedError,
  BookingDatesRequiredError,
  BookingNotDraftError,
  BookingNotFoundError,
  BookingResourcesRequiredError,
  InvalidBookingInputError,
} from '../../booking/booking.contract';
import { BookingResponseDto } from '../../booking/presentation/dto/booking.response.dto';
import {
  CalculatePriceBusinessArchivedError,
  CalculatePriceBusinessNotFoundError,
  CalculatePriceOutsideValidityError,
  CalculatePriceRatePlanArchivedError,
  CalculatePriceRatePlanNotAssignedError,
  CalculatePriceRatePlanNotFoundError,
  CalculatePriceResourceNotFoundError,
  CalculatePriceResourceUnavailableError,
  InvalidCalculatePriceInputError,
} from '../../pricing/application/calculate-price.errors';
import { InvalidManualPriceOverrideInputError } from '../../pricing/application/manual-price-override.errors';
import {
  BookingNotPendingError,
  BookingPricingRequiredError,
  InvalidBookingPricingInputError,
} from '../application/confirm-booking.errors';
import { ConfirmBookingUseCase } from '../application/confirm-booking.use-case';
import { CancelBookingUseCase } from '../application/cancel-booking.use-case';
import { SubmitBookingUseCase } from '../application/submit-booking.use-case';
import { ConfirmBookingRequestDto } from './dto/confirm-booking.request.dto';
import { BusinessAccess } from '../../../shared/security/security.decorators';

@ApiTags('Bookings')
@BusinessAccess('businessId')
@Controller('businesses/:businessId/bookings')
export class BookingLifecycleController {
  constructor(
    private readonly submitBooking: SubmitBookingUseCase,
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
  ) {}

  @Post(':bookingId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submits a draft booking for availability validation.',
  })
  @ApiOkResponse({
    type: BookingResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async submit(
    @Param('businessId')
    businessId: string,
    @Param('bookingId')
    bookingId: string,
  ): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(
        await this.submitBooking.execute({
          businessId,
          bookingId,
        }),
      );
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  @Post(':bookingId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirms a pending booking and persists its pricing snapshot.',
  })
  @ApiOkResponse({
    type: BookingResponseDto,
  })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async confirm(
    @Param('businessId')
    businessId: string,
    @Param('bookingId')
    bookingId: string,
    @Body()
    body: ConfirmBookingRequestDto,
  ): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(
        await this.confirmBooking.execute({
          businessId,
          bookingId,
          pricing: body.pricing,
        }),
      );
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  @Post(':bookingId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancels a draft, pending, or confirmed booking.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async cancel(
    @Param('businessId') businessId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(
        await this.cancelBooking.execute({ businessId, bookingId }),
      );
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  private mapError(
    error: unknown,
  ): Error {
    if (this.isBadRequest(error)) {
      return new BadRequestException(
        error.message,
      );
    }

    if (this.isNotFound(error)) {
      return new NotFoundException(
        error.message,
      );
    }

    if (this.isConflict(error)) {
      return new ConflictException(
        error.message,
      );
    }

    return error instanceof Error
      ? error
      : new Error(
          'Error inesperado.',
        );
  }

  private isBadRequest(
    error: unknown,
  ): error is Error {
    return [
      InvalidBookingInputError,
      BookingPricingRequiredError,
      InvalidBookingPricingInputError,
      InvalidCalculatePriceInputError,
      InvalidManualPriceOverrideInputError,
    ].some(
      (type) => error instanceof type,
    );
  }

  private isNotFound(
    error: unknown,
  ): error is Error {
    return [
      BookingBusinessNotFoundError,
      BookingContactNotFoundError,
      BookingNotFoundError,
      CalculatePriceBusinessNotFoundError,
      CalculatePriceRatePlanNotFoundError,
      CalculatePriceResourceNotFoundError,
    ].some(
      (type) => error instanceof type,
    );
  }

  private isConflict(
    error: unknown,
  ): error is Error {
    return [
      BookingBusinessUnavailableError,
      BookingNotDraftError,
      BookingNotPendingError,
      BookingCancellationNotAllowedError,
      BookingContactRequiredError,
      BookingResourcesRequiredError,
      BookingDatesRequiredError,
      BookingAvailabilityConflictError,
      CalculatePriceBusinessArchivedError,
      CalculatePriceRatePlanArchivedError,
      CalculatePriceRatePlanNotAssignedError,
      CalculatePriceResourceUnavailableError,
      CalculatePriceOutsideValidityError,
    ].some(
      (type) => error instanceof type,
    );
  }
}
