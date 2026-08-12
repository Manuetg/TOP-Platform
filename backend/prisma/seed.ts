import { AmenityCategory, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const amenityDefinitions: Array<[string, string, AmenityCategory]> = [
  ['WIFI', 'Wi-Fi', AmenityCategory.CONNECTIVITY], ['AIR_CONDITIONING', 'Aire acondicionado', AmenityCategory.CLIMATE], ['HEATING', 'Calefacción', AmenityCategory.CLIMATE], ['PRIVATE_BATHROOM', 'Baño privado', AmenityCategory.BATHROOM], ['HOT_WATER', 'Agua caliente', AmenityCategory.BATHROOM], ['KITCHEN', 'Cocina', AmenityCategory.KITCHEN], ['KITCHENETTE', 'Kitchenette', AmenityCategory.KITCHEN], ['REFRIGERATOR', 'Heladera', AmenityCategory.KITCHEN], ['MICROWAVE', 'Microondas', AmenityCategory.KITCHEN], ['TV', 'Televisión', AmenityCategory.ENTERTAINMENT], ['PARKING', 'Estacionamiento', AmenityCategory.PARKING], ['POOL', 'Piscina', AmenityCategory.OUTDOOR], ['GRILL', 'Parrilla', AmenityCategory.OUTDOOR], ['BALCONY', 'Balcón', AmenityCategory.OUTDOOR], ['SCENIC_VIEW', 'Vista panorámica', AmenityCategory.OUTDOOR], ['BREAKFAST', 'Desayuno', AmenityCategory.SERVICES], ['ACCESSIBLE', 'Accesibilidad', AmenityCategory.ACCESSIBILITY], ['PETS_ALLOWED', 'Mascotas permitidas', AmenityCategory.GENERAL],
];
const amenities: Array<{ code: string; name: string; category: AmenityCategory; sortOrder: number }> = amenityDefinitions.map(([code, name, category], sortOrder) => ({ code, name, category, sortOrder }));

async function main(): Promise<void> {
  for (const amenity of amenities) {
    await prisma.amenity.upsert({ where: { code: amenity.code }, update: { name: amenity.name, category: amenity.category, sortOrder: amenity.sortOrder, active: true }, create: { ...amenity, active: true } });
  }
}

main().finally(() => prisma.$disconnect());
