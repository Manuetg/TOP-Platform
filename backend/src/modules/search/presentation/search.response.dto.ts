import { ApiProperty } from '@nestjs/swagger';
import type { SearchType } from '../application/search-business.use-case';
class SearchItemDto {
  @ApiProperty({ enum: ['resource', 'contact', 'booking'] }) type!: SearchType;
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) subtitle!: string | null;
  @ApiProperty() status!: string;
}
class SearchGroupDto {
  @ApiProperty({ enum: ['resource', 'contact', 'booking'] }) type!: SearchType;
  @ApiProperty({ type: [SearchItemDto] }) items!: SearchItemDto[];
  @ApiProperty() hasMore!: boolean;
}
export class SearchResponseDto {
  @ApiProperty({ type: [SearchGroupDto] }) groups!: SearchGroupDto[];
}
