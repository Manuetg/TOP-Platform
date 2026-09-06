import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
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
  ApiNoContentResponse,
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
import { ResourceImageCoverResponseDto } from './dto/resource-image-cover.response.dto';
import { ResourceImageResponseDto } from './dto/resource-image.response.dto';
import { ReorderResourceImagesRequestDto } from './dto/reorder-resource-images.request.dto';
import { InvalidResourceImageInputError, ResourceImageLimitReachedError, UploadResourceImageUseCase } from '../application/upload-resource-image.use-case';
import { ListResourceImageCoversUseCase } from '../application/list-resource-image-covers.use-case';
import { ListResourceImagesUseCase } from '../application/list-resource-images.use-case';
import {
  DeleteResourceImageUseCase,
  InvalidResourceImageIdError,
  ResourceImageNotFoundError,
} from '../application/delete-resource-image.use-case';
import {
  InvalidResourceImageOrderError,
  ReorderResourceImagesUseCase,
} from '../application/reorder-resource-images.use-case';
import { AmenitiesNotFoundError, InactiveAmenitiesError, InvalidResourceAmenitiesInputError, ResourceAmenitiesArchivedError, ResourceAmenitiesBusinessArchivedError, ResourceAmenitiesBusinessNotFoundError, ResourceAmenitiesNotFoundError, SetResourceAmenitiesUseCase } from '../application/set-resource-amenities.use-case';
import { SetResourceAmenitiesRequestDto } from './dto/set-resource-amenities.request.dto';
import { BusinessAccess } from '../../../shared/security/security.decorators';

function isResourceImageBadRequestError(
  error: unknown,
): boolean {
  return (
    error instanceof InvalidBusinessIdError ||
    error instanceof InvalidResourceIdError ||
    error instanceof InvalidResourceImageInputError ||
    error instanceof InvalidResourceImageIdError ||
    error instanceof InvalidResourceImageOrderError
  );
}

function isResourceImageNotFoundError(
  error: unknown,
): boolean {
  return (
    error instanceof GetBusinessNotFoundError ||
    error instanceof ResourceNotFoundError ||
    error instanceof ResourceImageNotFoundError
  );
}

function isResourceImageConflictError(
  error: unknown,
): boolean {
  return (
    error instanceof ResourceBusinessArchivedError ||
    error instanceof ResourceArchivedError ||
    error instanceof ResourceImageLimitReachedError
  );
}
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
    private readonly listResourceImageCovers: ListResourceImageCoversUseCase,
    private readonly listResourceImages: ListResourceImagesUseCase,
    private readonly deleteResourceImage: DeleteResourceImageUseCase,
    private readonly reorderResourceImages: ReorderResourceImagesUseCase,
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

  @Get('images/covers')
  @ApiOperation({
    summary:
      'Lists one signed cover image per Resource in the Business.',
  })
  @ApiOkResponse({
    type: ResourceImageCoverResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  async listImageCovers(
    @Param('businessId') businessId: string,
  ): Promise<ResourceImageCoverResponseDto[]> {
    try {
      return (
        await this.listResourceImageCovers.execute(
          businessId,
        )
      ).map((cover) =>
        ResourceImageCoverResponseDto.fromApplication(
          cover,
        ),
      );
    } catch (error: unknown) {
      if (
        error instanceof InvalidBusinessIdError
      ) {
        throw new BadRequestException(
          error.message,
        );
      }

      if (
        error instanceof GetBusinessNotFoundError
      ) {
        throw new NotFoundException(
          error.message,
        );
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

  @Get(':resourceId/images')
  @ApiOperation({ summary: 'Lists the persisted descriptive images of a resource in deterministic order.' })
  @ApiOkResponse({ type: ResourceImageResponseDto, isArray: true })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async listImages(@Param('businessId') businessId: string, @Param('resourceId') resourceId: string): Promise<ResourceImageResponseDto[]> {
    try { return (await this.listResourceImages.execute(businessId, resourceId)).map((image) => ResourceImageResponseDto.fromListed(image)); }
    catch (error: unknown) { this.throwUploadError(error); }
  }

  @Delete(':resourceId/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deletes one persisted Resource image.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async deleteImage(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    try {
      await this.deleteResourceImage.execute({
        businessId,
        resourceId,
        imageId,
      });
    } catch (error: unknown) {
      this.throwUploadError(error);
    }
  }

  @Put(':resourceId/images/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Persists the complete order of a Resource image collection.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async reorderImages(
    @Param('businessId') businessId: string,
    @Param('resourceId') resourceId: string,
    @Body() body: ReorderResourceImagesRequestDto,
  ): Promise<void> {
    try {
      await this.reorderResourceImages.execute({
        businessId,
        resourceId,
        imageIds: body.imageIds,
      });
    } catch (error: unknown) {
      this.throwUploadError(error);
    }
  }
  private throwUploadError(error: unknown): never {
    if (isResourceImageBadRequestError(error)) {
      throw new BadRequestException(
        (error as Error).message,
      );
    }

    if (isResourceImageNotFoundError(error)) {
      throw new NotFoundException(
        (error as Error).message,
      );
    }

    if (isResourceImageConflictError(error)) {
      throw new ConflictException(
        (error as Error).message,
      );
    }

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
