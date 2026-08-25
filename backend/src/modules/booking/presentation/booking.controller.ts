import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBookingUseCase } from '../application/create-booking.use-case';
import { GetBookingUseCase } from '../application/get-booking.use-case';
import { ListBookingsUseCase } from '../application/list-bookings.use-case';
import { UpdateBookingUseCase } from '../application/update-booking.use-case';
import { SubmitBookingUseCase } from '../application/submit-booking.use-case';
import { BookingAvailabilityConflictError, BookingBusinessNotFoundError, BookingBusinessUnavailableError, BookingContactNotFoundError, BookingContactRequiredError, BookingDatesRequiredError, BookingNotDraftError, BookingNotFoundError, BookingResourceNotFoundError, BookingResourceUnavailableError, BookingResourcesRequiredError, InvalidBookingInputError } from '../application/booking.errors';
import { BookingResponseDto } from './dto/booking.response.dto';
import { CreateBookingRequestDto } from './dto/create-booking.request.dto';
import { UpdateBookingRequestDto } from './dto/update-booking.request.dto';
import { ListBookingsRequestDto } from './dto/list-bookings.request.dto';

@ApiTags('Bookings')
@Controller('businesses/:businessId/bookings')
export class BookingController {
  constructor(private readonly create: CreateBookingUseCase, private readonly getBooking: GetBookingUseCase, private readonly list: ListBookingsUseCase, private readonly updateBooking: UpdateBookingUseCase, private readonly submitBooking: SubmitBookingUseCase) {}
  @Post() @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Creates an incomplete draft booking.' }) @ApiCreatedResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async createBooking(@Param('businessId') businessId: string, @Body() body: CreateBookingRequestDto): Promise<BookingResponseDto> { try { return BookingResponseDto.fromDomain(await this.create.execute({ businessId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Get() @ApiOperation({ summary: 'Lists bookings scoped to a business.' }) @ApiOkResponse({ type: BookingResponseDto, isArray: true }) @ApiBadRequestResponse()
  async listBookings(@Param('businessId') businessId: string, @Query() query: ListBookingsRequestDto): Promise<BookingResponseDto[]> { try { return (await this.list.execute(businessId, query)).map((booking) => BookingResponseDto.fromDomain(booking)); } catch (error: unknown) { throw this.mapError(error); } }
  @Get(':bookingId') @ApiOperation({ summary: 'Gets a booking scoped to a business.' }) @ApiOkResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async get(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string): Promise<BookingResponseDto> { try { return BookingResponseDto.fromDomain(await this.getBooking.execute(businessId, bookingId)); } catch (error: unknown) { throw this.mapError(error); } }
  @Patch(':bookingId') @ApiOperation({ summary: 'Updates a draft booking partially.' }) @ApiOkResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async update(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: UpdateBookingRequestDto): Promise<BookingResponseDto> { try { return BookingResponseDto.fromDomain(await this.updateBooking.execute({ businessId, bookingId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Post(':bookingId/submit') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Submits a draft booking for availability validation.' }) @ApiOkResponse({ type: BookingResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async submit(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string): Promise<BookingResponseDto> { try { return BookingResponseDto.fromDomain(await this.submitBooking.execute({ businessId, bookingId })); } catch (error: unknown) { throw this.mapError(error); } }
  private mapError(error: unknown): Error {
    if (error instanceof InvalidBookingInputError) return new BadRequestException(error.message);
    if ([BookingBusinessNotFoundError, BookingContactNotFoundError, BookingResourceNotFoundError, BookingNotFoundError].some((type) => error instanceof type)) return new NotFoundException((error as Error).message);
    if ([BookingBusinessUnavailableError, BookingResourceUnavailableError, BookingNotDraftError, BookingContactRequiredError, BookingResourcesRequiredError, BookingDatesRequiredError, BookingAvailabilityConflictError].some((type) => error instanceof type)) return new ConflictException((error as Error).message);
    return error instanceof Error ? error : new Error('Error inesperado.');
  }
}
