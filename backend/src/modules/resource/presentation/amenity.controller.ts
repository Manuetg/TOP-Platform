import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListAmenitiesUseCase } from '../application/list-amenities.use-case';
import { AmenityResponseDto } from './dto/amenity.response.dto';

@ApiTags('Amenities')
@Controller('amenities')
export class AmenityController {
  constructor(private readonly listAmenities: ListAmenitiesUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Lists the active global amenity catalog.' })
  @ApiOkResponse({ type: AmenityResponseDto, isArray: true })
  async list(): Promise<AmenityResponseDto[]> {
    return (await this.listAmenities.execute()).map((amenity) => AmenityResponseDto.fromDomain(amenity));
  }
}
