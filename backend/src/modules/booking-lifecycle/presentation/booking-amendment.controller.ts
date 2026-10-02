import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingNotFoundError, InvalidBookingInputError } from '../../booking/booking.contract';
import { BookingResponseDto } from '../../booking/presentation/dto/booking.response.dto';
import { AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, AvailabilityResourceNotFoundError } from '../../availability/availability.contract';
import { BusinessAccessWithPricingOverride } from '../../../shared/security/security.decorators';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BookingAmendmentConflictError, BookingAmendmentPermissionError, type BookingAmendmentPreview } from '../booking-amendment.contract';
import { BookingAmendmentUseCase } from '../application/booking-amendment.use-case';
import { BookingPricingRequiredError, InvalidBookingPricingInputError } from '../application/confirm-booking.errors';
import { InvalidCalculatePriceInputError, CalculatePriceBusinessArchivedError, CalculatePriceOutsideValidityError, CalculatePriceRatePlanArchivedError, CalculatePriceRatePlanNotAssignedError, CalculatePriceRatePlanNotFoundError, CalculatePriceResourceNotFoundError, CalculatePriceResourceUnavailableError, CalculatePriceBusinessNotFoundError } from '../../pricing/application/calculate-price.errors';
import { InvalidManualPriceOverrideInputError } from '../../pricing/application/manual-price-override.errors';
import { BookingAmendmentPreviewRequestDto, BookingAmendmentRequestDto } from './dto/booking-amendment.request.dto';

@ApiTags('Bookings')
@Controller('businesses/:businessId/bookings')
export class BookingAmendmentController {
  constructor(private readonly amendments: BookingAmendmentUseCase) {}

  @Post(':bookingId/amendment-preview')
  @HttpCode(HttpStatus.OK)
  @BusinessAccessWithPricingOverride('businessId')
  @ApiOperation({ summary: 'Calcula el precio y saldo de una edición sin persistirla.' })
  @ApiOkResponse() @ApiBadRequestResponse() @ApiConflictResponse() @ApiForbiddenResponse()
  async preview(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: BookingAmendmentPreviewRequestDto, @Req() request: AuthenticatedRequest): Promise<BookingAmendmentPreview> {
    try { return await this.amendments.preview({ ...body, businessId, bookingId, actorUserId: this.actor(request) }); }
    catch (error: unknown) { throw this.mapError(error); }
  }

  @Patch(':bookingId/amendment')
  @BusinessAccessWithPricingOverride('businessId')
  @ApiOperation({ summary: 'Guarda la edición aceptada conservando pagos e historial.' })
  @ApiOkResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiConflictResponse() @ApiForbiddenResponse()
  async save(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: BookingAmendmentRequestDto, @Req() request: AuthenticatedRequest): Promise<BookingResponseDto> {
    try { return BookingResponseDto.fromDomain(await this.amendments.save({ ...body, businessId, bookingId, actorUserId: this.actor(request) })); }
    catch (error: unknown) { throw this.mapError(error); }
  }

  private actor(request: AuthenticatedRequest): string {
    if (!request.authenticatedPrincipal) throw new ForbiddenException('Se requiere actor autenticado.');
    return request.authenticatedPrincipal.userId;
  }

  private mapError(error: unknown): Error {
    if (error instanceof BookingAmendmentPermissionError) return new ForbiddenException(error.message);
    if (this.isBadRequest(error)) return new BadRequestException(error.message);
    if (this.isNotFound(error)) return new NotFoundException(error.message);
    if (this.isConflict(error)) return new ConflictException(error.message);
    return error instanceof Error ? error : new Error('Error inesperado.');
  }

  private isBadRequest(error: unknown): error is Error {
    return [InvalidBookingInputError, BookingPricingRequiredError, InvalidBookingPricingInputError, InvalidCalculatePriceInputError, InvalidManualPriceOverrideInputError].some((type) => error instanceof type);
  }
  private isNotFound(error: unknown): error is Error {
    return [BookingNotFoundError, AvailabilityBusinessNotFoundError, AvailabilityResourceNotFoundError, CalculatePriceBusinessNotFoundError, CalculatePriceRatePlanNotFoundError, CalculatePriceResourceNotFoundError].some((type) => error instanceof type);
  }
  private isConflict(error: unknown): error is Error {
    return [BookingAmendmentConflictError, AvailabilityBusinessUnavailableError, CalculatePriceBusinessArchivedError, CalculatePriceRatePlanArchivedError, CalculatePriceRatePlanNotAssignedError, CalculatePriceResourceUnavailableError, CalculatePriceOutsideValidityError].some((type) => error instanceof type);
  }
}
