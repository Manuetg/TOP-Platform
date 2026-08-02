import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBusinessUseCase, InvalidBusinessNameError } from '../application/create-business.use-case';
import { BusinessNotFoundError, GetBusinessByIdUseCase } from '../application/get-business-by-id.use-case';
import { BusinessResponseDto } from './dto/business.response.dto';
import { CreateBusinessRequestDto } from './dto/create-business.request.dto';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessController {
  constructor(
    private readonly createBusinessUseCase: CreateBusinessUseCase,
    private readonly getBusinessByIdUseCase: GetBusinessByIdUseCase,
  ) {}

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

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un negocio por identificador' })
  @ApiOkResponse({ type: BusinessResponseDto })
  @ApiBadRequestResponse({ description: 'El identificador del negocio no es un UUID válido.' })
  @ApiNotFoundResponse({ description: 'El negocio no existe.' })
  async getById(@Param('id', new ParseUUIDPipe()) id: string): Promise<BusinessResponseDto> {
    try {
      const business = await this.getBusinessByIdUseCase.execute(id);

      return BusinessResponseDto.fromDomain(business);
    } catch (error: unknown) {
      if (error instanceof BusinessNotFoundError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
}
