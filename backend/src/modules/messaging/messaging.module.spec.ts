import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MESSAGING_CONNECTION_RESOLVER } from './domain/messaging-connection.repository';
import { MessagingModule } from './messaging.module';
import { PrismaMessagingConnectionResolver } from './infrastructure/prisma-messaging-connection.resolver';

describe('MessagingModule wiring', () => {
  it('registra y exporta el resolver provider-agnostic como alias de Prisma', async () => {
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://top:top@localhost:5432/top_test?schema=public' })] }), MessagingModule] }).compile();

    expect(module.get(MESSAGING_CONNECTION_RESOLVER)).toBe(module.get(PrismaMessagingConnectionResolver));
    await module.close();
  });
});
