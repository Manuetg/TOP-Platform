import { Controller, Get } from '@nestjs/common';
import { HealthService, type HealthStatus } from '../application/health.service';
import { Public } from '../security/security.decorators';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.healthService.check();
  }
}
