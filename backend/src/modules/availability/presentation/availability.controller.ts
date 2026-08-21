import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AvailabilityBusinessNotFoundError,
  AvailabilityBusinessUnavailableError,
  AvailabilityResourceNotFoundError,
  CheckAvailabilityUseCase,
  InvalidAvailabilityInputError,
  type AvailabilityResult,
} from '../application/check-availability.use-case';
import {
  ListAvailabilityCalendarUseCase,
  type AvailabilityCalendarResult,
} from '../application/list-availability-calendar.use-case';

@ApiTags('Availability')
@Controller('businesses/:businessId/availability')
export class AvailabilityController {
  constructor(
    private readonly check: CheckAvailabilityUseCase,
    private readonly calendar: ListAvailabilityCalendarUseCase,
  ) {}

  @Get()
  @ApiOkResponse()
  async execute(
    @Param('businessId') businessId: string,
    @Query('resourceId') resourceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<AvailabilityResult> {
    try {
      return await this.check.execute({ businessId, resourceId, from, to });
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  @Get('calendar')
  @ApiOkResponse()
  async listCalendar(
    @Param('businessId') businessId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('resourceId') resourceId?: string,
  ): Promise<AvailabilityCalendarResult> {
    try {
      return await this.calendar.execute({ businessId, from, to, resourceId });
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  private mapError(error: unknown): never {
    if (error instanceof InvalidAvailabilityInputError) {
      throw new BadRequestException(error.message);
    }
    if (
      error instanceof AvailabilityBusinessNotFoundError ||
      error instanceof AvailabilityResourceNotFoundError
    ) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof AvailabilityBusinessUnavailableError) {
      throw new ConflictException(error.message);
    }
    throw error;
  }
}
