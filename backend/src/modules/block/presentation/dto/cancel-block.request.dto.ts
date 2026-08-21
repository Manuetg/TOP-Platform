import { IsString } from 'class-validator';
export class CancelBlockRequestDto { @IsString() reason!: string; }
