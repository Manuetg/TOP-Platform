import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { CreateUserUseCase } from '../application/create-user.use-case';

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    throw new Error('Uso: npm run create:admin-user -- <email> <password>');
  }
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const user = await app.get(CreateUserUseCase).execute({ email, password });
    process.stdout.write(`Usuario administrativo creado: ${user.email}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'No se pudo crear el usuario administrativo.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
