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
import { CreateResourceRequestDto } from './dto/create-resource.request.dto';
import { ResourceResponseDto } from './dto/resource.response.dto';

@ApiTags('Resources')
@Controller('businesses/:businessId/resources')
export class ResourceController {
  constructor(
    private readonly create: CreateResourceUseCase,
    private readonly getResource: GetResourceUseCase,
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
