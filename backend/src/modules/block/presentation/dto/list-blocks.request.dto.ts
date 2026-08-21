import { IsOptional, IsString } from 'class-validator';
export class ListBlocksRequestDto { @IsOptional() @IsString() resourceId?: string; @IsOptional() @IsString() from?: string; @IsOptional() @IsString() to?: string; }
