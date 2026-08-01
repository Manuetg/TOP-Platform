import { HealthController } from './health.controller';
import { HealthService, type HealthStatus } from '../application/health.service';

describe('HealthController', () => {
  it('delega la consulta de estado al servicio', () => {
    const expectedStatus: HealthStatus = { status: 'ok' };
    const healthService = new HealthService();
    const check = jest.spyOn(healthService, 'check').mockReturnValue(expectedStatus);
    const controller = new HealthController(healthService);

    expect(controller.check()).toEqual(expectedStatus);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
