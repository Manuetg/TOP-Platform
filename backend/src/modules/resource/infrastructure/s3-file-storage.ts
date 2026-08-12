import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import type { FileStoragePort, StoredFile } from '../domain/file-storage.port';

export class S3FileStorage implements FileStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT'); const region = config.get<string>('S3_REGION'); const bucket = config.get<string>('S3_BUCKET'); const accessKeyId = config.get<string>('S3_ACCESS_KEY'); const secretAccessKey = config.get<string>('S3_SECRET_KEY');
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) throw new Error('La configuración S3 es obligatoria.');
    this.bucket = bucket;
    this.client = new S3Client({ endpoint, region, forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') === 'true', credentials: { accessKeyId, secretAccessKey } });
  }
  async upload(file: StoredFile): Promise<void> { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: file.key, Body: file.buffer, ContentType: file.mimeType, ContentLength: file.buffer.length })); }
  async delete(key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
  createSignedReadUrl(key: string): Promise<string> { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 3600 }); }
}
