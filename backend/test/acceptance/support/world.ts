import { setDefaultTimeout, setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';

export class TopWorld extends World {
  app?: INestApplication;
  response?: Response;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(TopWorld);
setDefaultTimeout(5000);
