import { Injectable } from '@nestjs/common';
import type { FileStoragePort, StoredFile } from '../domain/file-storage.port';

@Injectable()
export class InMemoryFileStorage implements FileStoragePort {
  private readonly files = new Map<string, StoredFile>();

  upload(file: StoredFile): Promise<void> {
    this.files.set(file.key, file);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }

  createSignedReadUrl(key: string): Promise<string> {
    return this.files.has(key)
      ? Promise.resolve(`https://signed.local/${encodeURIComponent(key)}?expiresIn=3600`)
      : Promise.reject(new Error('El archivo no existe.'));
  }
}
