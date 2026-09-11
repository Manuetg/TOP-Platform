import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { GetBusinessDashboardUseCase } from '../application/get-business-dashboard.use-case';
import {
  OccupancyKpiInputError,
  OccupancyKpiNotFoundError,
} from '../application/get-occupancy-kpi.use-case';
import {
  ReservationsKpiInputError,
  ReservationsKpiNotFoundError,
} from '../application/get-reservations-kpi.use-case';
import {
  RevenueKpiInputError,
  RevenueKpiNotFoundError,
} from '../application/get-revenue-kpi.use-case';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

const inputErrors = [
  OccupancyKpiInputError,
  RevenueKpiInputError,
  ReservationsKpiInputError,
];
const notFoundErrors = [
  OccupancyKpiNotFoundError,
  RevenueKpiNotFoundError,
  ReservationsKpiNotFoundError,
];

@ApiTags('Dashboard')
@Controller('businesses/:businessId/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: GetBusinessDashboardUseCase) {}

  @Get()
  @BusinessAccess('businessId', Capability.DASHBOARD_READ)
  @ApiOperation({
    summary: 'Returns Occupancy, Revenue and Reservations KPIs for the requested Business-local period.',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiBadRequestResponse({ description: 'The Business identifier or required [from,to) period is invalid.' })
  @ApiNotFoundResponse({ description: 'The Business does not exist.' })
  @ApiInternalServerErrorResponse({ description: 'A KPI projection violates an internal invariant.' })
  async get(
    @Param('businessId') businessId: string,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardResponseDto> {
    try {
      return DashboardResponseDto.fromApplication(
        await this.dashboard.execute({ businessId, from: query.from, to: query.to }),
      );
    } catch (error: unknown) {
      if (inputErrors.some((type) => error instanceof type)) {
        throw new BadRequestException((error as Error).message);
      }
      if (notFoundErrors.some((type) => error instanceof type)) {
        throw new NotFoundException((error as Error).message);
      }
      throw error;
    }
  }
}
