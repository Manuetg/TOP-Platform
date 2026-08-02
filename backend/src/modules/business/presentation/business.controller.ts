import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBusinessUseCase, InvalidBusinessNameError } from '../application/create-business.use-case';
import { ArchiveBusinessUseCase } from '../application/archive-business.use-case';
import { BusinessNotFoundError, GetBusinessByIdUseCase } from '../application/get-business-by-id.use-case';
import { ListBusinessesUseCase } from '../application/list-businesses.use-case';
import { InvalidBusinessUpdateError, UpdateBusinessUseCase } from '../application/update-business.use-case';
import { BusinessResponseDto } from './dto/business.response.dto';
import { CreateBusinessRequestDto } from './dto/create-business.request.dto';
import { UpdateBusinessRequestDto } from './dto/update-business.request.dto';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessController {
  constructor(
    private readonly createBusinessUseCase: CreateBusinessUseCase,
    private readonly archiveBusinessUseCase: ArchiveBusinessUseCase,
    private readonly getBusinessByIdUseCase: GetBusinessByIdUseCase,
    private readonly listBusinessesUseCase: ListBusinessesUseCase,
    private readonly updateBusinessUseCase: UpdateBusinessUseCase,
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

  @Get()
  @ApiOperation({ summary: 'Listar negocios' })
  @ApiOkResponse({ type: BusinessResponseDto, isArray: true, description: 'Returns all businesses.' })
  async list(): Promise<BusinessResponseDto[]> {
    const businesses = await this.listBusinessesUseCase.execute();

    return businesses.map((business) => BusinessResponseDto.fromDomain(business));
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archivar un negocio' })
  @ApiOkResponse({ type: BusinessResponseDto })
  @ApiBadRequestResponse({ description: 'El identificador del negocio no es un UUID válido.' })
  @ApiNotFoundResponse({ description: 'El negocio no existe.' })
  async archive(@Param('id', new ParseUUIDPipe()) id: string): Promise<BusinessResponseDto> {
    try {
      const business = await this.archiveBusinessUseCase.execute(id);

      return BusinessResponseDto.fromDomain(business);
    } catch (error: unknown) {
      if (error instanceof BusinessNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente un negocio' })
  @ApiOkResponse({ type: BusinessResponseDto })
  @ApiBadRequestResponse({ description: 'La actualización del negocio no es válida.' })
  @ApiNotFoundResponse({ description: 'El negocio no existe.' })
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() request: UpdateBusinessRequestDto): Promise<BusinessResponseDto> {
    try {
      const business = await this.updateBusinessUseCase.execute(id, request);
      return BusinessResponseDto.fromDomain(business);
    } catch (error: unknown) {
      if (error instanceof BusinessNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidBusinessUpdateError) throw new BadRequestException(error.message);
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
