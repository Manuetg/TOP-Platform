import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
export class BookingTimelineQueryDto { @ApiPropertyOptional({description:'Cursor Base64URL opaco devuelto por la página anterior.'}) @IsOptional() @IsString() cursor?:string; @ApiPropertyOptional({default:50,minimum:1,maximum:50,type:String,example:'20'}) @IsOptional() @IsString() limit?:string; }
