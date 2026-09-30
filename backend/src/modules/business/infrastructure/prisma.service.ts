import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(@Optional() config?: ConfigService) {
    super(config ? { datasourceUrl: config.getOrThrow<string>('DATABASE_URL') } : undefined);
  }
}
