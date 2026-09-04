import { BadRequestException, Body, ConflictException, Controller, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateMembershipUseCase, InvalidMembershipInputError, MembershipAlreadyExistsError, MembershipNotFoundError } from '../application/create-membership.use-case';
import { MembershipResponseDto } from './dto/membership.response.dto';
import { CreateMembershipRequestDto } from './dto/create-membership.request.dto';
import { BusinessAccessByBody } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import { MembershipRole } from '../domain/membership-role.enum';

const assignmentCapabilities = {
  [MembershipRole.OWNER]: Capability.MEMBERSHIP_ASSIGN_OWNER,
  [MembershipRole.ADMIN]: Capability.MEMBERSHIP_ASSIGN_ADMIN,
  [MembershipRole.RECEPTIONIST]: Capability.MEMBERSHIP_ASSIGN_RECEPTIONIST,
  [MembershipRole.VIEWER]: Capability.MEMBERSHIP_ASSIGN_VIEWER,
} as const;

@ApiTags('Memberships') @Controller('businesses/:businessId/memberships')
export class MembershipController {
  constructor(private readonly useCase: CreateMembershipUseCase) {}
  @Post() @BusinessAccessByBody('businessId', Capability.MEMBERSHIP_CREATE, 'role', assignmentCapabilities) @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Crear una membresía de negocio' }) @ApiCreatedResponse() @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async create(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Body() body: CreateMembershipRequestDto): Promise<MembershipResponseDto> {
    try { return MembershipResponseDto.fromDomain(await this.useCase.execute({ ...body, businessId })); } catch (error: unknown) { if (error instanceof InvalidMembershipInputError) throw new BadRequestException(error.message); if (error instanceof MembershipNotFoundError) throw new NotFoundException(error.message); if (error instanceof MembershipAlreadyExistsError) throw new ConflictException(error.message); throw error; }
  }
}
