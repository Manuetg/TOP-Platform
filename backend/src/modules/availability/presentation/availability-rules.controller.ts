import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, InvalidAvailabilityInputError } from '../application/availability.errors';
import { GetAvailabilityRulesUseCase, UpdateAvailabilityRulesUseCase } from '../application/availability-rules.use-cases';
import { AvailabilityRulesResponseDto, UpdateAvailabilityRulesRequestDto } from './dto/availability-rules.dto';
import { BusinessAccess } from '../../../shared/security/security.decorators';

@ApiTags('Availability')
@BusinessAccess('businessId')
@Controller('businesses/:businessId/availability-rules')
export class AvailabilityRulesController {
  constructor(private readonly getRules: GetAvailabilityRulesUseCase, private readonly updateRules: UpdateAvailabilityRulesUseCase) {}
  @Get() @ApiOkResponse({ type: AvailabilityRulesResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async get(@Param('businessId') businessId: string): Promise<AvailabilityRulesResponseDto> { try { return await this.getRules.execute(businessId); } catch (error: unknown) { this.map(error); } }
  @Patch() @ApiOkResponse({ type: AvailabilityRulesResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async update(@Param('businessId') businessId: string, @Body() body: UpdateAvailabilityRulesRequestDto): Promise<AvailabilityRulesResponseDto> { try { return await this.updateRules.execute({ businessId, ...body }); } catch (error: unknown) { this.map(error); } }
  private map(error: unknown): never { if (error instanceof InvalidAvailabilityInputError) throw new BadRequestException(error.message); if (error instanceof AvailabilityBusinessNotFoundError) throw new NotFoundException(error.message); if (error instanceof AvailabilityBusinessUnavailableError) throw new ConflictException(error.message); throw error; }
}
