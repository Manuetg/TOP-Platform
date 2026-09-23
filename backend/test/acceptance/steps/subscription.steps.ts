import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { SubscriptionUseCase } from '../../../src/modules/subscription/application/subscription.use-case';
import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { addResourceFake } from '../support/resource-repository.fake';
import { TopWorld } from '../support/world';

let result: Awaited<ReturnType<SubscriptionUseCase['get']>>;
let first: Awaited<ReturnType<SubscriptionUseCase['requestUpgrade']>>;
let second: typeof first;
const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
Given('un plan TOP Inicial con recursos activos, fuera de servicio y archivados', function () {
  Object.values(ResourceStatus).forEach((status, index) => addResourceFake(Resource.create({ id: `resource-${index}`, businessId, name: status, internalCode: `CODE-${index}`, description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status, sortOrder: index, createdAt: new Date(), updatedAt: new Date() })));
});
When('consulto el cupo operativo del establecimiento', async function (this: TopWorld) { result = await this.app!.get(SubscriptionUseCase).get(businessId); });
Then('el cupo muestra dos usados y ocho disponibles', function () { assert.equal(result.usage.resources.used, 2); assert.equal(result.usage.resources.available, 8); assert.equal(result.entitlements.maxResources, 10); });
When('solicito ampliación dos veces', async function (this: TopWorld) { const useCase = this.app!.get(SubscriptionUseCase); first = await useCase.requestUpgrade(businessId, 'actor'); second = await useCase.requestUpgrade(businessId, 'actor'); result = await useCase.get(businessId); });
Then('queda una solicitud con la misma fecha y el cupo original', function () { assert.equal(first.requestedAt, second.requestedAt); assert.equal(result.upgrade.status, 'REQUESTED'); assert.equal(result.entitlements.maxResources, 10); });
