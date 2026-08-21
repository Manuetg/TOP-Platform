import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlockBusinessNotFoundError, BlockBusinessUnavailableError, BlockFinishedError, BlockNotFoundError, BlockResourceNotFoundError, BlockResourceUnavailableError, InvalidBlockInputError } from '../application/block.errors';
import { CancelBlockUseCase } from '../application/cancel-block.use-case';
import { CreateBlockUseCase } from '../application/create-block.use-case';
import { ListBlocksUseCase } from '../application/list-blocks.use-case';
import { BlockResponseDto } from './dto/block.response.dto';
import { CancelBlockRequestDto } from './dto/cancel-block.request.dto';
import { CreateBlockRequestDto } from './dto/create-block.request.dto';
import { ListBlocksRequestDto } from './dto/list-blocks.request.dto';

@ApiTags('Blocks')
@Controller('businesses/:businessId')
export class BlockController {
  constructor(private readonly create: CreateBlockUseCase, private readonly cancel: CancelBlockUseCase, private readonly list: ListBlocksUseCase) {}
  @Post('resources/:resourceId/blocks') @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Creates a scheduled block for a resource.' }) @ApiCreatedResponse({ type: BlockResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async createBlock(@Param('businessId') businessId: string, @Param('resourceId') resourceId: string, @Body() body: CreateBlockRequestDto): Promise<BlockResponseDto> { try { return BlockResponseDto.fromDomain(await this.create.execute({ businessId, resourceId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Patch('blocks/:blockId/cancel') @ApiOperation({ summary: 'Cancels a scheduled or active block without deleting history.' }) @ApiOkResponse({ type: BlockResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async cancelBlock(@Param('businessId') businessId: string, @Param('blockId') blockId: string, @Body() body: CancelBlockRequestDto): Promise<BlockResponseDto> { try { return BlockResponseDto.fromDomain(await this.cancel.execute({ businessId, blockId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Get('blocks') @ApiOperation({ summary: 'Lists block history scoped to a business.' }) @ApiOkResponse({ type: BlockResponseDto, isArray: true }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async listBlocks(@Param('businessId') businessId: string, @Query() query: ListBlocksRequestDto): Promise<BlockResponseDto[]> { try { return (await this.list.execute({ businessId, ...query })).map((block) => BlockResponseDto.fromDomain(block)); } catch (error: unknown) { throw this.mapError(error); } }
  private mapError(error: unknown): Error { if (error instanceof InvalidBlockInputError) return new BadRequestException(error.message); if (error instanceof BlockBusinessNotFoundError || error instanceof BlockResourceNotFoundError || error instanceof BlockNotFoundError) return new NotFoundException(error.message); if (error instanceof BlockBusinessUnavailableError || error instanceof BlockResourceUnavailableError || error instanceof BlockFinishedError) return new ConflictException(error.message); return error instanceof Error ? error : new Error('Error inesperado.'); }
}
