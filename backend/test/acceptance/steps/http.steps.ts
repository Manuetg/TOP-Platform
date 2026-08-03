import { Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { TopWorld } from '../support/world';

Then('recibo HTTP {int}', function (this: TopWorld, status: number): void {
  assert.equal(this.response?.status, status);
});
