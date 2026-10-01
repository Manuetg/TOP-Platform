import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ResourceAvailabilityCalendar } from "./ResourceAvailabilityCalendar";

const useBookingsMock = vi.fn();
const useBlocksMock = vi.fn();

vi.mock("../../bookings/queries/use-bookings", () => ({
  useBookings: (...args: unknown[]) => useBookingsMock(...args),
}));

vi.mock("../../blocks/queries/use-blocks", () => ({
  useBlocks: (...args: unknown[]) => useBlocksMock(...args),
}));

describe("ResourceAvailabilityCalendar", () => {
  beforeEach(() => {
    useBookingsMock.mockReset();
    useBlocksMock.mockReset();
    useBookingsMock.mockReturnValue({
      data: [
        {
          id: "booking-1",
          status: "CONFIRMED",
          checkInDate: "2026-09-10",
          checkOutDate: "2026-09-12",
        },
      ],
      isLoading: false,
      isError: false,
    });
    useBlocksMock.mockReturnValue({
      data: [
        {
          id: "block-1",
          reason: "Mantenimiento",
          startsAt: "2026-09-18T12:00:00.000Z",
          endsAt: "2026-09-19T12:00:00.000Z",
          effectiveStatus: "SCHEDULED",
        },
      ],
      isLoading: false,
      isError: false,
    });
  });

  it("renders reservations and blocks for the selected resource month", () => {
    render(
      <ResourceAvailabilityCalendar
        businessId="business-1"
        resourceId="resource-1"
        timezone="America/Asuncion"
      />,
    );

    expect(screen.getByRole("heading", { name: "Reservas y bloqueos" })).toBeInTheDocument();
    expect(screen.getAllByText("Confirmada")).not.toHaveLength(0);
    expect(screen.getAllByText("Mantenimiento")).not.toHaveLength(0);
    expect(useBookingsMock).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "resource-1" }));
    expect(useBlocksMock).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "resource-1" }));
  });

  it("changes the visible month", async () => {
    const user = userEvent.setup();
    render(
      <ResourceAvailabilityCalendar
        businessId="business-1"
        resourceId="resource-1"
        timezone="America/Asuncion"
      />,
    );

    const previousLabel = screen.getByText(/2026/).textContent;
    await user.click(screen.getByRole("button", { name: "Mes siguiente" }));

    expect(screen.getByText(/2026/).textContent).not.toBe(previousLabel);
  });
});
