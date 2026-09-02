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
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiConsumes,
  ApiBody,
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
import { ReactivateResourceUseCase } from '../application/reactivate-resource.use-case';
import { InvalidResourceUpdateError, ResourceArchivedError, ResourceBusinessArchivedError, ResourceCodeAlreadyExistsError as UpdateResourceCodeAlreadyExistsError, UpdateResourceUseCase } from '../application/update-resource.use-case';
import { CreateResourceRequestDto } from './dto/create-resource.request.dto';
import { ResourceResponseDto } from './dto/resource.response.dto';
import { UpdateResourceRequestDto } from './dto/update-resource.request.dto';
import { ResourceImageResponseDto } from './dto/resource-image.response.dto';
import { InvalidResourceImageInputError, ResourceImageLimitReachedError, UploadResourceImageUseCase } from '../application/upload-resource-image.use-case';
import { AmenitiesNotFoundError, InactiveAmenitiesError, InvalidResourceAmenitiesInputError, ResourceAmenitiesArchivedError, ResourceAmenitiesBusinessArchivedError, ResourceAmenitiesBusinessNotFoundError, ResourceAmenitiesNotFoundError, SetResourceAmenitiesUseCase } from '../application/set-resource-amenities.use-case';
import { SetResourceAmenitiesRequestDto } from './dto/set-resource-amenities.request.dto';
import { BusinessAccess } from '../../../shared/security/security.decorators';

@ApiTags('Resources')
@BusinessAccess('businessId')
@Controller('businesses/:businessId/resources')
export class ResourceController {
  constructor(
    private readonly create: CreateResourceUseCase,
    private readonly getResource: GetResourceUseCase,
    private readonly listResources: ListResourcesUseCase,
    private readonly updateResource: UpdateResourceUseCase,
    private readonly disableResource: DisableResourceUseCase,
    private readonly reactivateResource: ReactivateResourceUseCase,
    private readonly uploadResourceImage: UploadResourceImageUseCase,
    private readonly setResourceAmenities: SetResourceAmenitiesUseCase,
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

  @Post(':resourceId/images')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Uploads one descriptive image for a resource.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'JPEG, PNG or WEBP up to 5 MB.' } } } })
  @ApiCreatedResponse({ type: ResourceImageResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async uploadImage(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ResourceImageResponseDto> {
    try {
      return ResourceImageResponseDto.fromApplication(await this.uploadResourceImage.execute({ businessId, resourceId, file: file ? { buffer: file.buffer, mimeType: file.mimetype, size: file.size } : undefined }));
    } catch (error: unknown) {
      this.throwUploadError(error);
    }
  }

  private throwUploadError(error: unknown): never {
    if (error instanceof InvalidBusinessIdError || error instanceof InvalidResourceIdError || error instanceof InvalidResourceImageInputError) throw new BadRequestException(error.message);
    if (error instanceof GetBusinessNotFoundError || error instanceof ResourceNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof ResourceBusinessArchivedError || error instanceof ResourceArchivedError || error instanceof ResourceImageLimitReachedError) throw new ConflictException(error.message);
    throw error;
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

  @Patch(':resourceId/reactivate')
  @ApiOperation({ summary: 'Reactivates an out-of-service resource. This operation is idempotent.' })
  @ApiOkResponse({ type: ResourceResponseDto, description: 'Returns the resource with ACTIVE status.' })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async reactivate(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
  ): Promise<ResourceResponseDto> {
    try {
      return ResourceResponseDto.fromDomain(
        await this.reactivateResource.execute({ businessId, resourceId }),
      );
    } catch (error: unknown) {
      if (error instanceof InvalidBusinessIdError || error instanceof InvalidResourceIdError) throw new BadRequestException(error.message);
      if (error instanceof GetBusinessNotFoundError || error instanceof ResourceNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof ResourceBusinessArchivedError || error instanceof ResourceArchivedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Put(':resourceId/amenities')
  @ApiOperation({ summary: 'Replaces all resource amenities. This operation is idempotent.' })
  @ApiOkResponse({ type: ResourceResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async setAmenities(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
    @Body() body: SetResourceAmenitiesRequestDto,
  ): Promise<ResourceResponseDto> {
    try {
      return ResourceResponseDto.fromDomain(await this.setResourceAmenities.execute({ businessId, resourceId, amenityIds: body.amenityIds }));
    } catch (error: unknown) {
      if (error instanceof InvalidResourceAmenitiesInputError) throw new BadRequestException(error.message);
      if (error instanceof ResourceAmenitiesBusinessNotFoundError || error instanceof ResourceAmenitiesNotFoundError || error instanceof AmenitiesNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof ResourceAmenitiesBusinessArchivedError || error instanceof ResourceAmenitiesArchivedError || error instanceof InactiveAmenitiesError) throw new ConflictException(error.message);
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
