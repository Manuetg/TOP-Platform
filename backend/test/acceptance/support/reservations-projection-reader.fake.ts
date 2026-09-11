import type {
  ReservationsProjectionInput,
  ReservationsProjectionReader,
  ReservationsProjectionRow,
} from '../../../src/modules/booking/booking.contract';

const projections = new Map<string, ReservationsProjectionRow[]>();
let lastInput: ReservationsProjectionInput | undefined;

export function resetReservationsProjectionReaderFake(): void {
  projections.clear();
  lastInput = undefined;
}

export function setReservationsProjection(
  businessId: string,
  rows: ReservationsProjectionRow[],
): void {
  projections.set(businessId, rows);
}

export function reservationsProjectionLastInput():
ReservationsProjectionInput | undefined {
  return lastInput;
}

export const reservationsProjectionReaderFake: ReservationsProjectionReader = {
  read: (input) => {
    lastInput = input;
    return Promise.resolve(projections.get(input.businessId) ?? []);
  },
};
