import type { OccupancyProjection, OccupancyProjectionReader } from '../../../src/modules/availability/availability.contract';

let projection: OccupancyProjection = { occupiedResourceNights: 0, sellableResourceNights: 0 };

export function resetOccupancyProjectionReaderFake(): void {
  projection = { occupiedResourceNights: 0, sellableResourceNights: 0 };
}

export function setOccupancyProjection(value: OccupancyProjection): void {
  projection = value;
}

export const occupancyProjectionReaderFake: OccupancyProjectionReader = {
  read: () => Promise.resolve(projection),
};
