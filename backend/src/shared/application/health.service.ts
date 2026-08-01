export interface HealthStatus {
  status: 'ok';
}

export class HealthService {
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
