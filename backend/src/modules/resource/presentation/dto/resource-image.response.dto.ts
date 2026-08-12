import { ApiProperty } from '@nestjs/swagger';
import type { UploadedResourceImage } from '../../application/upload-resource-image.use-case';

export class ResourceImageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty() url!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  static fromApplication(result: UploadedResourceImage): ResourceImageResponseDto { return { id: result.image.id, resourceId: result.image.resourceId, url: result.url, mimeType: result.image.mimeType, sizeBytes: result.image.sizeBytes, sortOrder: result.image.sortOrder, createdAt: result.image.createdAt, updatedAt: result.image.updatedAt }; }
}
