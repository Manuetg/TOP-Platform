import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Contact } from '../../domain/contact.entity';

export class ContactResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() businessId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) lastName!: string | null;
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) whatsapp!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) documentType!: string | null;
  @ApiPropertyOptional({ nullable: true }) documentNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) country!: string | null;
  @ApiPropertyOptional({ nullable: true }) city!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  static fromDomain(contact: Contact): ContactResponseDto { return { id: contact.id, businessId: contact.businessId, name: contact.name, lastName: contact.lastName, fullName: contact.fullName, phone: contact.phone, whatsapp: contact.whatsapp, email: contact.email, documentType: contact.documentType, documentNumber: contact.documentNumber, country: contact.country, city: contact.city, status: contact.status, createdAt: contact.createdAt, updatedAt: contact.updatedAt }; }
}
