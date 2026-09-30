import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaIdentityService extends PrismaClient implements OnModuleDestroy {
  constructor(@Optional() config?: ConfigService) {
    super(config ? { datasourceUrl: config.getOrThrow<string>('DATABASE_URL') } : undefined);
  }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}
