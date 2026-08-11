import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateResourceUseCase,
  InvalidResourceInputError,
  ResourceBusinessNotFoundError,
  ResourceBusinessUnavailableError,
  ResourceCodeAlreadyExistsError,
} from '../application/create-resource.use-case';
import {
  GetResourceUseCase,
  InvalidBusinessIdError,
  InvalidResourceIdError,
  ResourceBusinessNotFoundError as GetBusinessNotFoundError,
  ResourceNotFoundError,
} from '../application/get-resource.use-case';
import { ListResourcesUseCase } from '../application/list-resources.use-case';
import { DisableResourceUseCase } from '../application/disable-resource.use-case';
import { InvalidResourceUpdateError, ResourceArchivedError, ResourceBusinessArchivedError, ResourceCodeAlreadyExistsError as UpdateResourceCodeAlreadyExistsError, UpdateResourceUseCase } from '../application/update-resource.use-case';
import { CreateResourceRequestDto } from './dto/create-resource.request.dto';
import { ResourceResponseDto } from './dto/resource.response.dto';
import { UpdateResourceRequestDto } from './dto/update-resource.request.dto';

@ApiTags('Resources')
@Controller('businesses/:businessId/resources')
export class ResourceController {
  constructor(
    private readonly create: CreateResourceUseCase,
    private readonly getResource: GetResourceUseCase,
    private readonly listResources: ListResourcesUseCase,
    private readonly updateResource: UpdateResourceUseCase,
    private readonly disableResource: DisableResourceUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creates a resource for a business.' })
  @ApiCreatedResponse({ type: ResourceResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async createResource(
    @Param('businessId') businessId: string,
    @Body() body: CreateResourceRequestDto,
  ): Promise<ResourceResponseDto> {
    try {
      return ResourceResponseDto.fromDomain(
        await this.create.execute({ businessId, ...body }),
      );
    } catch (error: unknown) {
      if (error instanceof InvalidResourceInputError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof ResourceBusinessNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof ResourceBusinessUnavailableError ||
        error instanceof ResourceCodeAlreadyExistsError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Lists all resources for a business.' })
  @ApiOkResponse({ type: ResourceResponseDto, isArray: true })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  async list(@Param('businessId') businessId: string): Promise<ResourceResponseDto[]> {
    try {
      return (await this.listResources.execute(businessId)).map((resource) => ResourceResponseDto.fromDomain(resource));
    } catch (error: unknown) {
      if (error instanceof InvalidBusinessIdError) throw new BadRequestException(error.message);
      if (error instanceof GetBusinessNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(':resourceId/disable')
  @ApiOperation({ summary: 'Takes a resource out of service. This operation is idempotent.' })
  @ApiOkResponse({ type: ResourceResponseDto, description: 'Returns the resource with OUT_OF_SERVICE status.' })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async disable(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ResourceResponseDto> {
    try {
      return ResourceResponseDto.fromDomain(await this.disableResource.execute({ businessId, resourceId }));
    } catch (error: unknown) {
      if (error instanceof InvalidBusinessIdError || error instanceof InvalidResourceIdError) throw new BadRequestException(error.message);
      if (error instanceof GetBusinessNotFoundError || error instanceof ResourceNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof ResourceBusinessArchivedError || error instanceof ResourceArchivedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Patch(':resourceId')
  @ApiOperation({ summary: 'Updates a resource partially.' })
  @ApiOkResponse({ type: ResourceResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async update(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
    @Body() body: UpdateResourceRequestDto,
  ): Promise<ResourceResponseDto> {
    try {
      return ResourceResponseDto.fromDomain(await this.updateResource.execute({ businessId, resourceId, ...body }));
    } catch (error: unknown) {
      if (error instanceof InvalidBusinessIdError || error instanceof InvalidResourceIdError || error instanceof InvalidResourceUpdateError) throw new BadRequestException(error.message);
      if (error instanceof GetBusinessNotFoundError || error instanceof ResourceNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof ResourceBusinessArchivedError || error instanceof ResourceArchivedError || error instanceof UpdateResourceCodeAlreadyExistsError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get(':resourceId')
  @ApiOperation({ summary: 'Gets a resource by its business and resource identifiers.' })
  @ApiOkResponse({ type: ResourceResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  async get(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ResourceResponseDto> {
    try {
      return ResourceResponseDto.fromDomain(
        await this.getResource.execute(businessId, resourceId),
      );
    } catch (error: unknown) {
      if (error instanceof InvalidBusinessIdError || error instanceof InvalidResourceIdError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof GetBusinessNotFoundError || error instanceof ResourceNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
