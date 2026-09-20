import { Controller, Get, Header, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { SearchBusinessUseCase } from '../application/search-business.use-case';
import { SearchResponseDto } from './search.response.dto';

@ApiTags('Search')
@ApiBearerAuth('access-token')
@Controller('businesses/:businessId/search')
export class SearchController {
  constructor(private readonly search: SearchBusinessUseCase) {}
  @Get()
  @BusinessAccess('businessId', Capability.SEARCH_READ)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Busca entidades del negocio activo con resultados limitados y permisos por grupo.' })
  @ApiQuery({ name: 'q', required: true, schema: { type: 'string', minLength: 2, maxLength: 120 } })
  @ApiOkResponse({ type: SearchResponseDto })
  async get(@Param('businessId') businessId: string, @Query('q') query: unknown, @Req() request: AuthenticatedRequest): Promise<SearchResponseDto> {
    return this.search.execute(request.authenticatedPrincipal!.userId, businessId, query);
  }
}
