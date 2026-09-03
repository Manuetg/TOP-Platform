import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { BusinessAmenityBusinessArchivedError, BusinessAmenityBusinessNotFoundError, CreateBusinessAmenityUseCase, InvalidBusinessAmenityInputError } from '../application/create-business-amenity.use-case';
import { ListBusinessAmenitiesUseCase } from '../application/list-business-amenities.use-case';
import { CreateBusinessAmenityRequestDto } from './dto/create-business-amenity.request.dto';
import { AmenityResponseDto } from './dto/amenity.response.dto';

@ApiTags('Amenities')
@BusinessAccess('businessId')
@Controller('businesses/:businessId/amenities')
export class BusinessAmenityController {
  constructor(private readonly createAmenity: CreateBusinessAmenityUseCase, private readonly listAmenities: ListBusinessAmenitiesUseCase) {}
  @Post() @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Creates a custom amenity for a business.' }) @ApiCreatedResponse({ type: AmenityResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async create(@Param('businessId') businessId: string, @Body() body: CreateBusinessAmenityRequestDto): Promise<AmenityResponseDto> {
    try { return AmenityResponseDto.fromDomain(await this.createAmenity.execute({ businessId, ...body })); }
    catch (error: unknown) { if (error instanceof InvalidBusinessAmenityInputError) throw new BadRequestException(error.message); if (error instanceof BusinessAmenityBusinessNotFoundError) throw new NotFoundException(error.message); if (error instanceof BusinessAmenityBusinessArchivedError) throw new ConflictException(error.message); throw error; }
  }
  @Get() @ApiOperation({ summary: 'Lists active global and business custom amenities.' }) @ApiOkResponse({ type: AmenityResponseDto, isArray: true }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async list(@Param('businessId') businessId: string): Promise<AmenityResponseDto[]> {
    try { return (await this.listAmenities.execute(businessId)).map((amenity) => AmenityResponseDto.fromDomain(amenity)); }
    catch (error: unknown) { if (error instanceof InvalidBusinessAmenityInputError) throw new BadRequestException(error.message); if (error instanceof BusinessAmenityBusinessNotFoundError) throw new NotFoundException(error.message); if (error instanceof BusinessAmenityBusinessArchivedError) throw new ConflictException(error.message); throw error; }
  }
}
