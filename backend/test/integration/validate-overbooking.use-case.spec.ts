import { PrismaClient } from '@prisma/client';
import { PrismaAvailabilityRulesRepository } from '../../src/modules/availability/infrastructure/prisma-availability-rules.repository';
import { CheckAvailabilityUseCase } from '../../src/modules/availability/application/check-availability.use-case';
import { ValidateOverbookingUseCase } from '../../src/modules/availability/application/validate-overbooking.use-case';
import { PrismaBlockRepository } from '../../src/modules/block/infrastructure/prisma-block.repository';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test')
  ? describe
  : describe.skip;

describeWithPostgres(
  'ValidateOverbookingUseCase exclusion',
  () => {
    const prisma = new PrismaClient();

    const businesses =
      new PrismaBusinessRepository(prisma);

    const resources =
      new PrismaResourceRepository(prisma);

    const bookings =
      new PrismaBookingRepository(prisma);

    const blocks =
      new PrismaBlockRepository(prisma);

    const rules =
      new PrismaAvailabilityRulesRepository(prisma);

    const useCase =
      new ValidateOverbookingUseCase(
        new CheckAvailabilityUseCase(
          businesses,
          resources,
          bookings,
          blocks,
          rules,
        ),
      );

    beforeAll(async () => {
      await prisma.$connect();
    });

    beforeEach(async () => {
      await cleanTestDatabase(
        prisma,
        databaseUrl,
      );
    });

    afterEach(async () => {
      await cleanTestDatabase(
        prisma,
        databaseUrl,
      );
    });

    afterAll(async () => {
      await cleanTestDatabase(
        prisma,
        databaseUrl,
      );

      await prisma.$disconnect();
    });

    async function fixture(
      name: string,
    ) {
      const business =
        await prisma.business.create({
          data: {
            name,
          },
        });

      const resource =
        await prisma.resource.create({
          data: {
            businessId: business.id,
            name: `${name} Room`,
            internalCode:
              name.toUpperCase(),
            capacityMaximum: 2,
          },
        });

      const booking =
        await bookings.create({
          businessId: business.id,
          contactId: null,
          resourceIds: [
            resource.id,
          ],
          checkInDate:
            new Date('2026-06-10'),
          checkOutDate:
            new Date('2026-06-12'),
          adults: null,
          children: null,
          notes: null,
        });

      await bookings.markPending(
        booking.id,
      );

      return {
        business,
        resource,
        booking,
      };
    }

    it('does not treat the excluded PENDING Booking as its own conflict', async () => {
      const {
        business,
        resource,
        booking,
      } = await fixture(
        'Self exclusion',
      );

      await expect(
        useCase.validate({
          businessId: business.id,
          resourceIds: [
            resource.id,
          ],
          checkInDate:
            '2026-06-10',
          checkOutDate:
            '2026-06-12',
          excludeBookingId:
            booking.id,
        }),
      ).resolves.toEqual({
        valid: true,
        conflicts: [],
      });
    });

    it('still detects another intersecting PENDING Booking when the current Booking is excluded', async () => {
      const {
        business,
        resource,
        booking,
      } = await fixture(
        'Other conflict',
      );

      const blocker =
        await bookings.create({
          businessId:
            business.id,
          contactId: null,
          resourceIds: [
            resource.id,
          ],
          checkInDate:
            new Date(
              '2026-06-11',
            ),
          checkOutDate:
            new Date(
              '2026-06-13',
            ),
          adults: null,
          children: null,
          notes: null,
        });

      await bookings.markPending(
        blocker.id,
      );

      await expect(
        useCase.validate({
          businessId: business.id,
          resourceIds: [
            resource.id,
          ],
          checkInDate:
            '2026-06-10',
          checkOutDate:
            '2026-06-12',
          excludeBookingId:
            booking.id,
        }),
      ).resolves.toEqual({
        valid: false,
        conflicts: [
          {
            resourceId:
              resource.id,
            reasons: [
              'BOOKING_CONFLICT',
            ],
          },
        ],
      });
    });

    it('does not exclude a Booking belonging to another tenant from the current tenant lookup', async () => {
      const owner =
        await fixture('Owner');

      const other =
        await fixture('Other');

      await expect(
        useCase.validate({
          businessId:
            owner.business.id,
          resourceIds: [
            owner.resource.id,
          ],
          checkInDate:
            '2026-06-10',
          checkOutDate:
            '2026-06-12',
          excludeBookingId:
            other.booking.id,
        }),
      ).resolves.toEqual({
        valid: false,
        conflicts: [
          {
            resourceId:
              owner.resource.id,
            reasons: [
              'BOOKING_CONFLICT',
            ],
          },
        ],
      });
    });
  },
);