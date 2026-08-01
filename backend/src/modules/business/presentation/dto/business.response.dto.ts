import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Business } from '../../domain/business.entity';

export class BusinessResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  legalName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taxId!: string | null;

  @ApiProperty({ example: 'America/Asuncion' })
  timezone!: string;

  @ApiProperty({ example: 'PYG' })
  currency!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromDomain(business: Business): BusinessResponseDto {
    return {
      id: business.id,
      name: business.name,
      legalName: business.legalName,
      taxId: business.taxId,
      timezone: business.timezone,
      currency: business.currency,
      status: business.status,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };
  }
}
