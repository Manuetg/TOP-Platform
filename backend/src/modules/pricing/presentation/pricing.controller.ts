import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalculatePriceBusinessArchivedError, CalculatePriceBusinessNotFoundError, CalculatePriceOutsideValidityError, CalculatePriceRatePlanArchivedError, CalculatePriceRatePlanNotAssignedError, CalculatePriceRatePlanNotFoundError, CalculatePriceResourceNotFoundError, CalculatePriceResourceUnavailableError, InvalidCalculatePriceInputError } from '../application/calculate-price.errors';
import { CalculatePriceUseCase } from '../application/calculate-price.use-case';
import { ApplyManualPriceOverrideUseCase } from '../application/apply-manual-price-override.use-case';
import { InvalidManualPriceOverrideInputError } from '../application/manual-price-override.errors';
import { CreateRatePlanUseCase, InvalidRatePlanInputError, RatePlanBusinessArchivedError, RatePlanBusinessNotFoundError, RatePlanResourceArchivedError, RatePlanResourceNotFoundError } from '../application/create-rate-plan.use-case';
import { CreateSeasonalRateUseCase } from '../application/create-seasonal-rate.use-case';
import { ListSeasonalRatesUseCase } from '../application/list-seasonal-rates.use-case';
import { InvalidSeasonalRateInputError, SeasonalRateBusinessArchivedError, SeasonalRateBusinessNotFoundError, SeasonalRateOverlapError, SeasonalRatePlanArchivedError, SeasonalRatePlanNotFoundError, SeasonalRateValidityConflictError } from '../application/seasonal-rate.errors';
import { RatePlanArchivedError, RatePlanNotFoundError, UpdateRatePlanUseCase } from '../application/update-rate-plan.use-case';
import { CalculatePriceRequestDto } from './dto/calculate-price.request.dto';
import { CalculatePriceResponseDto } from './dto/calculate-price.response.dto';
import { ManualPriceOverrideRequestDto } from './dto/manual-price-override.request.dto';
import { ManualPriceOverrideResponseDto } from './dto/manual-price-override.response.dto';
import { CreateRatePlanRequestDto } from './dto/create-rate-plan.request.dto';
import { CreateSeasonalRateRequestDto } from './dto/create-seasonal-rate.request.dto';
import { RatePlanResponseDto } from './dto/rate-plan.response.dto';
import { SeasonalRateResponseDto } from './dto/seasonal-rate.response.dto';
import { UpdateRatePlanRequestDto } from './dto/update-rate-plan.request.dto';
import { BusinessAccess } from '../../../shared/security/security.decorators';

const notFoundErrors = [RatePlanBusinessNotFoundError, RatePlanResourceNotFoundError, RatePlanNotFoundError, SeasonalRateBusinessNotFoundError, SeasonalRatePlanNotFoundError, CalculatePriceBusinessNotFoundError, CalculatePriceResourceNotFoundError, CalculatePriceRatePlanNotFoundError];
const conflictErrors = [RatePlanBusinessArchivedError, RatePlanResourceArchivedError, RatePlanArchivedError, SeasonalRateBusinessArchivedError, SeasonalRatePlanArchivedError, SeasonalRateValidityConflictError, SeasonalRateOverlapError, CalculatePriceBusinessArchivedError, CalculatePriceResourceUnavailableError, CalculatePriceRatePlanArchivedError, CalculatePriceRatePlanNotAssignedError, CalculatePriceOutsideValidityError];
const isExpectedError = (error: unknown, types: Array<new (...args: never[]) => Error>): boolean => types.some((type) => error instanceof type);

@ApiTags('Pricing')
@BusinessAccess('businessId')
@Controller('businesses/:businessId/rate-plans')
export class PricingController {
  constructor(private readonly createRatePlan: CreateRatePlanUseCase, private readonly updateRatePlan: UpdateRatePlanUseCase, private readonly createSeasonalRate: CreateSeasonalRateUseCase, private readonly listSeasonalRates: ListSeasonalRatesUseCase, private readonly calculatePriceUseCase: CalculatePriceUseCase, private readonly applyManualPriceOverrideUseCase: ApplyManualPriceOverrideUseCase) {}
  @Post() @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Creates an active rate plan with an optional resource assignment.' }) @ApiCreatedResponse({ type: RatePlanResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async create(@Param('businessId') businessId: string, @Body() body: CreateRatePlanRequestDto): Promise<RatePlanResponseDto> { try { return RatePlanResponseDto.fromDomain(await this.createRatePlan.execute({ businessId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Post(':ratePlanId/calculate') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Calculates the nightly price for a Resource stay without persisting it.' }) @ApiOkResponse({ type: CalculatePriceResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async calculate(@Param('businessId') businessId: string, @Param('ratePlanId') ratePlanId: string, @Body() body: CalculatePriceRequestDto): Promise<CalculatePriceResponseDto> { try { return CalculatePriceResponseDto.fromDomain(await this.calculatePriceUseCase.execute({ businessId, ratePlanId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Post(':ratePlanId/calculate/override') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Calculates a manual agreed total without persisting it.' }) @ApiOkResponse({ type: ManualPriceOverrideResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async override(@Param('businessId') businessId: string, @Param('ratePlanId') ratePlanId: string, @Body() body: ManualPriceOverrideRequestDto): Promise<ManualPriceOverrideResponseDto> { try { return ManualPriceOverrideResponseDto.fromDomain(await this.applyManualPriceOverrideUseCase.execute({ businessId, ratePlanId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Post(':ratePlanId/seasonal-rates') @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Creates a seasonal price rule for an active rate plan.' }) @ApiCreatedResponse({ type: SeasonalRateResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async createSeason(@Param('businessId') businessId: string, @Param('ratePlanId') ratePlanId: string, @Body() body: CreateSeasonalRateRequestDto): Promise<SeasonalRateResponseDto> { try { return SeasonalRateResponseDto.fromDomain(await this.createSeasonalRate.execute({ businessId, ratePlanId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Get(':ratePlanId/seasonal-rates') @ApiOperation({ summary: 'Lists seasonal price rules in deterministic date order.' }) @ApiOkResponse({ type: [SeasonalRateResponseDto] }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async listSeasons(@Param('businessId') businessId: string, @Param('ratePlanId') ratePlanId: string): Promise<SeasonalRateResponseDto[]> { try { return (await this.listSeasonalRates.execute(businessId, ratePlanId)).map((rate) => SeasonalRateResponseDto.fromDomain(rate)); } catch (error: unknown) { throw this.mapError(error); } }
  @Patch(':ratePlanId') @ApiOperation({ summary: 'Updates an active rate plan partially.' }) @ApiOkResponse({ type: RatePlanResponseDto })
  async update(@Param('businessId') businessId: string, @Param('ratePlanId') ratePlanId: string, @Body() body: UpdateRatePlanRequestDto): Promise<RatePlanResponseDto> { try { return RatePlanResponseDto.fromDomain(await this.updateRatePlan.execute({ businessId, ratePlanId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  private mapError(error: unknown): Error { if (error instanceof InvalidRatePlanInputError || error instanceof InvalidSeasonalRateInputError || error instanceof InvalidCalculatePriceInputError || error instanceof InvalidManualPriceOverrideInputError) return new BadRequestException(error.message); if (isExpectedError(error, notFoundErrors)) return new NotFoundException((error as Error).message); if (isExpectedError(error, conflictErrors)) return new ConflictException((error as Error).message); return error instanceof Error ? error : new Error('Error inesperado.'); }
}
