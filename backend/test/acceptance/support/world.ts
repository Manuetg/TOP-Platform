import { setDefaultTimeout, setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import type { OccupancyKpi } from '../../../src/modules/dashboard/application/get-occupancy-kpi.use-case';

export class TopWorld extends World {
  app?: INestApplication;
  response?: Response;
  ratePlanId?: string;
  contactId?: string;
  blockId?: string;
  bookingId?: string;
  accessToken?: string;
  occupancyResult?: OccupancyKpi;
  occupancyError?: Error;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(TopWorld);
setDefaultTimeout(5000);
