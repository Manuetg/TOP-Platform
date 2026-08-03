import { BadRequestException, Body, ConflictException, Controller, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateMembershipUseCase, InvalidMembershipInputError, MembershipAlreadyExistsError, MembershipNotFoundError } from '../application/create-membership.use-case';
import { MembershipRole } from '../domain/membership-role.enum';
import { MembershipResponseDto } from './dto/membership.response.dto';
@ApiTags('Memberships') @Controller('businesses/:businessId/memberships')
export class MembershipController {
  constructor(private readonly useCase: CreateMembershipUseCase) {}
  @Post() @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Crear una membresía de negocio' }) @ApiCreatedResponse() @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async create(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Body() body: { userId: string; role: MembershipRole }): Promise<MembershipResponseDto> {
    try { return MembershipResponseDto.fromDomain(await this.useCase.execute({ ...body, businessId })); } catch (error: unknown) { if (error instanceof InvalidMembershipInputError) throw new BadRequestException(error.message); if (error instanceof MembershipNotFoundError) throw new NotFoundException(error.message); if (error instanceof MembershipAlreadyExistsError) throw new ConflictException(error.message); throw error; }
  }
}
