import { ApiProperty } from '@nestjs/swagger';
import { Resource } from '../../domain/resource.entity';
import { ResourceAmenityResponseDto } from './amenity.response.dto';

export class ResourceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() businessId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() internalCode!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() capacityMinimum!: number;
  @ApiProperty() capacityMaximum!: number;
  @ApiProperty() capacityMaximumChildren!: number;
  @ApiProperty() status!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [ResourceAmenityResponseDto] }) amenities!: ResourceAmenityResponseDto[];

  static fromDomain(resource: Resource): ResourceResponseDto {
    return {
      id: resource.id,
      businessId: resource.businessId,
      name: resource.name,
      internalCode: resource.internalCode,
      description: resource.description,
      capacityMinimum: resource.capacityMinimum,
      capacityMaximum: resource.capacityMaximum,
      capacityMaximumChildren: resource.capacityMaximumChildren,
      status: resource.status,
      sortOrder: resource.sortOrder,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
      amenities: resource.amenities.map((amenity) => ResourceAmenityResponseDto.fromDomain(amenity)),
    };
  }
}
