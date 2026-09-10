import {
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import {
  GetOutstandingBalanceUseCase,
  OutstandingBalanceConflictError,
  OutstandingBalanceNotFoundError,
} from '../application/get-outstanding-balance.use-case';
import { OutstandingBalanceResponseDto } from './dto/outstanding-balance.response.dto';

@ApiTags('Payment')
@Controller('businesses/:businessId/bookings/:bookingId/outstanding-balance')
export class OutstandingBalanceController {
  constructor(private readonly getOutstandingBalance: GetOutstandingBalanceUseCase) {}

  @Get()
  @BusinessAccess('businessId', Capability.PAYMENT_READ)
  @ApiOperation({ summary: 'Gets the derived financial balance for a Booking.' })
  @ApiOkResponse({ type: OutstandingBalanceResponseDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  @ApiInternalServerErrorResponse()
  async get(
    @Param('businessId') businessId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<OutstandingBalanceResponseDto> {
    try {
      return await this.getOutstandingBalance.execute(businessId, bookingId);
    } catch (error: unknown) {
      if (error instanceof OutstandingBalanceNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof OutstandingBalanceConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
