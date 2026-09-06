import { ApiProperty } from '@nestjs/swagger';
import type { ListedResourceImageCover } from '../../application/list-resource-image-covers.use-case';

export class ResourceImageCoverResponseDto {
  @ApiProperty()
  resourceId!: string;

  @ApiProperty()
  imageId!: string;

  @ApiProperty()
  url!: string;

  static fromApplication(
    result: ListedResourceImageCover,
  ): ResourceImageCoverResponseDto {
    return {
      resourceId: result.resourceId,
      imageId: result.imageId,
      url: result.url,
    };
  }
}