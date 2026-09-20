import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { SearchBusinessUseCase, type SearchResponse } from '../../../src/modules/search/application/search-business.use-case';
import { GetBusinessCapabilitiesUseCase } from '../../../src/modules/identity/identity.contract';
import { AuthorizationPolicy } from '../../../src/shared/application/authorization-policy';
import { MembershipRole } from '../../../src/modules/identity/domain/membership-role.enum';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { businessRepositoryFake } from '../support/business-repository.fake';
import { membershipRepositoryFake } from '../support/membership-repository.fake';
import type { TopWorld } from '../support/world';
interface SearchWorld extends TopWorld { searchCase?: SearchBusinessUseCase; searchResult?: SearchResponse; searchError?: unknown; }
const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
Given('una búsqueda global con seis recursos autorizados', async function (this: SearchWorld) {
  await membershipRepositoryFake.create({ businessId, userId: 'search-user', role: MembershipRole.VIEWER });
  const access = new GetBusinessCapabilitiesUseCase(membershipRepositoryFake, new AuthorizationPolicy());
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `r-${i}`, title: 'Cabaña', subtitle: null, status: ResourceStatus.ACTIVE, internalPrivate: 'synthetic' }));
  this.searchCase = new SearchBusinessUseCase(businessRepositoryFake, access, { read: () => Promise.resolve(rows) }, { read: () => Promise.resolve([]) }, { read: () => Promise.resolve([]) });
});
When('busco globalmente {string}', async function (this: SearchWorld, query: string) {
  try { this.searchResult = await this.searchCase!.execute('search-user', businessId, query); } catch (error) { this.searchError = error; }
});
Then('recibo cinco recursos y un indicador de más resultados', function (this: SearchWorld) {
  assert.equal(this.searchResult?.groups[0].items.length, 5); assert.equal(this.searchResult?.groups[0].hasMore, true);
});
Then('la búsqueda global no expone campos privados', function (this: SearchWorld) {
  assert.equal(JSON.stringify(this.searchResult).includes('internalPrivate'), false);
});
Then('la búsqueda global rechaza la consulta', function (this: SearchWorld) { assert.ok(this.searchError); assert.equal(this.searchResult, undefined); });
