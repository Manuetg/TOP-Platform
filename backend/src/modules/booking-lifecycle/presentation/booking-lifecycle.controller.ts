import { InvalidListRatePlansInputError, ListRatePlansBusinessNotFoundError, ListRatePlansBusinessArchivedError, ListRatePlansResourceNotFoundError, ListRatePlansResourceUnavailableError } from '../../pricing/application/list-rate-plans.use-case';
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
  BookingResourceNotFoundError,
  BookingResourceUnavailableError,
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
  BookingPaymentRequiredError,
  BookingPricingRequiredError,
  InvalidBookingPricingInputError,
} from '../application/confirm-booking.errors';
import { ConfirmBookingUseCase } from '../application/confirm-booking.use-case';
import { CancelBookingUseCase } from '../application/cancel-booking.use-case';
import { SubmitBookingUseCase } from '../application/submit-booking.use-case';
import { ConfirmBookingRequestDto } from './dto/confirm-booking.request.dto';
import { BusinessAccess, BusinessAccessWithPricingOverride } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { CancelBookingRequestDto } from './dto/cancel-booking.request.dto';
import { CreatePendingBookingUseCase } from '../application/create-pending-booking.use-case';
import { CreatePendingBookingRequestDto } from './dto/create-pending-booking.request.dto';
import { AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, AvailabilityResourceNotFoundError } from '../../availability/availability.contract';

@ApiTags('Bookings')
@Controller('businesses/:businessId/bookings')
export class BookingLifecycleController {
  constructor(
    private readonly submitBooking: SubmitBookingUseCase,
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly createPendingBooking?: CreatePendingBookingUseCase,
  ) {}

  @Post('pending')
  @BusinessAccessWithPricingOverride('businessId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creates a complete pending booking with its agreed pricing; a positive recorded payment confirms it.' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async createPending(
    @Param('businessId') businessId: string,
    @Body() body: CreatePendingBookingRequestDto,
    @Req() request?: AuthenticatedRequest,
  ): Promise<BookingResponseDto> {
    try {
      if (!this.createPendingBooking) throw new Error('No se configuró el alta de reservas pendientes.');
      return BookingResponseDto.fromDomain(await this.createPendingBooking.execute({
        businessId, ...body,
        ...(request?.authenticatedPrincipal ? { actorUserId: request.authenticatedPrincipal.userId } : {}),
      }));
    } catch (error: unknown) { throw this.mapError(error); }
  }

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
  @BusinessAccessWithPricingOverride('businessId')
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
      InvalidListRatePlansInputError,
    ].some(
      (type) => error instanceof type,
    );
  }

  private isNotFound(
    error: unknown,
  ): error is Error {
    return [
      BookingBusinessNotFoundError,
      AvailabilityBusinessNotFoundError,
      AvailabilityResourceNotFoundError,
      BookingResourceNotFoundError,
      ListRatePlansBusinessNotFoundError,
      ListRatePlansResourceNotFoundError,
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
      BookingResourceUnavailableError,
      AvailabilityBusinessUnavailableError,
      ListRatePlansBusinessArchivedError,
      ListRatePlansResourceUnavailableError,
      BookingNotDraftError,
      BookingNotPendingError,
      BookingPaymentRequiredError,
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
