import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateResourceRequestDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() internalCode?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsInt() capacityMinimum?: number;
  @IsOptional() @IsInt() capacityMaximum?: number;
  @IsOptional() @IsInt() capacityMaximumChildren?: number;
  @IsOptional() @IsInt() sortOrder?: number;
}
