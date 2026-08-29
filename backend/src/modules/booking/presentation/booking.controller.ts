import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBookingUseCase } from '../application/create-booking.use-case';
import { GetBookingUseCase } from '../application/get-booking.use-case';
import { ListBookingsUseCase } from '../application/list-bookings.use-case';
import { UpdateBookingUseCase } from '../application/update-booking.use-case';
import { BookingBusinessNotFoundError, BookingBusinessUnavailableError, BookingContactNotFoundError, BookingNotDraftError, BookingNotFoundError, BookingResourceNotFoundError, BookingResourceUnavailableError, InvalidBookingInputError } from '../application/booking.errors';
import { BookingResponseDto } from './dto/booking.response.dto';
import { CreateBookingRequestDto } from './dto/create-booking.request.dto';
import { UpdateBookingRequestDto } from './dto/update-booking.request.dto';
import { ListBookingsRequestDto } from './dto/list-bookings.request.dto';
import { BusinessAccess } from '../../../shared/security/security.decorators';

@ApiTags('Bookings')
@BusinessAccess('businessId')
@Controller('businesses/:businessId/bookings')
export class BookingController {
  constructor(private readonly create: CreateBookingUseCase, private readonly getBooking: GetBookingUseCase, private readonly list: ListBookingsUseCase, private readonly updateBooking: UpdateBookingUseCase) {}
  @Post() @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Creates an incomplete draft booking.' }) @ApiCreatedResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async createBooking(@Param('businessId') businessId: string, @Body() body: CreateBookingRequestDto): Promise<BookingResponseDto> { try { return BookingResponseDto.fromDomain(await this.create.execute({ businessId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Get() @ApiOperation({ summary: 'Lists bookings scoped to a business.' }) @ApiOkResponse({ type: BookingResponseDto, isArray: true }) @ApiBadRequestResponse()
  async listBookings(@Param('businessId') businessId: string, @Query() query: ListBookingsRequestDto): Promise<BookingResponseDto[]> { try { return (await this.list.execute(businessId, query)).map((booking) => BookingResponseDto.fromDomain(booking)); } catch (error: unknown) { throw this.mapError(error); } }
  @Get(':bookingId') @ApiOperation({ summary: 'Gets a booking scoped to a business.' }) @ApiOkResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async get(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string): Promise<BookingResponseDto> { try { return BookingResponseDto.fromDomain(await this.getBooking.execute(businessId, bookingId)); } catch (error: unknown) { throw this.mapError(error); } }
  @Patch(':bookingId') @ApiOperation({ summary: 'Updates a draft booking partially.' }) @ApiOkResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async update(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: UpdateBookingRequestDto): Promise<BookingResponseDto> { try { return BookingResponseDto.fromDomain(await this.updateBooking.execute({ businessId, bookingId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  private mapError(error: unknown): Error { if (error instanceof InvalidBookingInputError) return new BadRequestException(error.message); if (error instanceof BookingBusinessNotFoundError || error instanceof BookingContactNotFoundError || error instanceof BookingResourceNotFoundError || error instanceof BookingNotFoundError) return new NotFoundException(error.message); if (error instanceof BookingBusinessUnavailableError || error instanceof BookingResourceUnavailableError || error instanceof BookingNotDraftError) return new ConflictException(error.message); return error instanceof Error ? error : new Error('Error inesperado.'); }
}
