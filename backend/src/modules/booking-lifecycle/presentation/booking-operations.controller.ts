import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, HttpCode, HttpStatus, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingBusinessNotFoundError, BookingBusinessUnavailableError, BookingNotFoundError, InvalidBookingInputError } from '../../booking/booking.contract';
import { BookingResponseDto } from '../../booking/presentation/dto/booking.response.dto';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import { BookingOperation } from '../booking-operation.contract';
import { OperateBookingUseCase } from '../application/operate-booking.use-case';
import { BookingOperationConflictError, BookingOperationForbiddenError } from '../application/booking-operation.errors';
import { BookingOperationRequestDto } from './dto/booking-operation.request.dto';

@ApiTags('Bookings')
@Controller('businesses/:businessId/bookings')
@BusinessAccess('businessId', Capability.BOOKING_WRITE)
@ApiOkResponse({ type: BookingResponseDto })
@ApiBadRequestResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
export class BookingOperationsController {
  constructor(private readonly operateBooking: OperateBookingUseCase) {}

  @Post(':bookingId/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra manualmente el ingreso de una reserva confirmada.' })
  checkIn(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: BookingOperationRequestDto, @Req() request: AuthenticatedRequest): Promise<BookingResponseDto> {
    return this.execute(BookingOperation.CHECK_IN, businessId, bookingId, body, request);
  }

  @Post(':bookingId/check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra manualmente la salida y finaliza una reserva en curso.' })
  checkOut(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: BookingOperationRequestDto, @Req() request: AuthenticatedRequest): Promise<BookingResponseDto> {
    return this.execute(BookingOperation.CHECK_OUT, businessId, bookingId, body, request);
  }

  @Post(':bookingId/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca manualmente No show en una reserva confirmada.' })
  noShow(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: BookingOperationRequestDto, @Req() request: AuthenticatedRequest): Promise<BookingResponseDto> {
    return this.execute(BookingOperation.NO_SHOW, businessId, bookingId, body, request);
  }

  @Post(':bookingId/confirm-without-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma una reserva pendiente con total cero, sin generar un pago.' })
  confirmWithoutPayment(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: BookingOperationRequestDto, @Req() request: AuthenticatedRequest): Promise<BookingResponseDto> {
    return this.execute(BookingOperation.CONFIRM_WITHOUT_PAYMENT, businessId, bookingId, body, request);
  }

  private async execute(operation: BookingOperation, businessId: string, bookingId: string, body: BookingOperationRequestDto, request: AuthenticatedRequest): Promise<BookingResponseDto> {
    try {
      return BookingResponseDto.fromDomain(await this.operateBooking.execute({ businessId, bookingId, operation, actorUserId: request.authenticatedPrincipal?.userId, expectedUpdatedAt: body.expectedUpdatedAt, reason: body.reason }));
    } catch (error: unknown) {
      if (error instanceof InvalidBookingInputError) throw new BadRequestException(error.message);
      if (error instanceof BookingNotFoundError || error instanceof BookingBusinessNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof BookingOperationForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof BookingOperationConflictError || error instanceof BookingBusinessUnavailableError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
