import { IsIn, IsOptional, IsString } from 'class-validator';
import { BlockType } from '../../domain/block-type.enum';

export class CreateBlockRequestDto {
  @IsIn(Object.values(BlockType)) type!: BlockType;
  @IsString() reason!: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsString() startsAt!: string;
  @IsString() endsAt!: string;
}
