import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBusinessUseCase, InvalidBusinessNameError } from '../application/create-business.use-case';
import { BusinessResponseDto } from './dto/business.response.dto';
import { CreateBusinessRequestDto } from './dto/create-business.request.dto';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessController {
  constructor(private readonly createBusinessUseCase: CreateBusinessUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un negocio' })
  @ApiCreatedResponse({ type: BusinessResponseDto })
  @ApiBadRequestResponse({ description: 'El nombre del negocio es inválido.' })
  async create(@Body() request: CreateBusinessRequestDto): Promise<BusinessResponseDto> {
    try {
      const business = await this.createBusinessUseCase.execute(request);

      return BusinessResponseDto.fromDomain(business);
    } catch (error: unknown) {
      if (error instanceof InvalidBusinessNameError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }
}
