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
  Req,
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
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { CancelBookingRequestDto } from './dto/cancel-booking.request.dto';

@ApiTags('Bookings')
@Controller('businesses/:businessId/bookings')
export class BookingLifecycleController {
  constructor(
    private readonly submitBooking: SubmitBookingUseCase,
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
  ) {}

  @Post(':bookingId/submit')
  @BusinessAccess('businessId', Capability.BOOKING_WRITE)
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
    @Req() request?: AuthenticatedRequest,
  ): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(
        await this.submitBooking.execute({
          businessId,
          bookingId,
          ...(request?.authenticatedPrincipal ? { actorUserId: request.authenticatedPrincipal.userId } : {}),
        }),
      );
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  @Post(':bookingId/confirm')
  @BusinessAccess('businessId', Capability.BOOKING_WRITE)
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
    @Req() request?: AuthenticatedRequest,
  ): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(
        await this.confirmBooking.execute({
          businessId,
          bookingId,
          pricing: body.pricing,
          ...(request?.authenticatedPrincipal ? { actorUserId: request.authenticatedPrincipal.userId } : {}),
        }),
      );
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  @Post(':bookingId/cancel')
  @BusinessAccess('businessId', Capability.BOOKING_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancels a draft, pending, or confirmed booking.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async cancel(
    @Param('businessId') businessId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: CancelBookingRequestDto = {},
    @Req() request?: AuthenticatedRequest,
  ): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(
        await this.cancelBooking.execute({ businessId, bookingId, ...(request?.authenticatedPrincipal ? { actorUserId: request.authenticatedPrincipal.userId } : {}), ...(body.reason !== undefined ? { reason: body.reason } : {}) }),
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
