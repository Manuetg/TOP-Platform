import { HealthService } from './health.service';

describe('HealthService', () => {
  it('informa un estado saludable', () => {
    const service = new HealthService();

    expect(service.check()).toEqual({ status: 'ok' });
  });
});
