export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface StoredFile {
  key: string;
  buffer: Buffer;
  mimeType: string;
}

export interface FileStoragePort {
  upload(file: StoredFile): Promise<void>;
  delete(key: string): Promise<void>;
  createSignedReadUrl(key: string): Promise<string>;
}
