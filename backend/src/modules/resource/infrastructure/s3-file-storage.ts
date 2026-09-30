import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { readS3Configuration } from '../../../config/environment';
import type {
  FileStoragePort,
  StoredFile,
} from '../domain/file-storage.port';

export class S3FileStorage implements FileStoragePort {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const { endpoint, publicEndpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle } = readS3Configuration(config);

    const credentials = {
      accessKeyId,
      secretAccessKey,
    };

    this.bucket = bucket;

    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials,
    });

    this.signingClient =
      publicEndpoint === endpoint
        ? this.client
        : new S3Client({
            endpoint: publicEndpoint,
            region,
            forcePathStyle,
            credentials,
          });
  }

  async upload(file: StoredFile): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: file.key,
        Body: file.buffer,
        ContentType: file.mimeType,
        ContentLength: file.buffer.length,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  createSignedReadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      {
        expiresIn: 3600,
      },
    );
  }
}
