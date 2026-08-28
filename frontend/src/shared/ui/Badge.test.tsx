import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge>Confirmada</Badge>);

    expect(screen.getByText("Confirmada")).toBeInTheDocument();
  });

  it("uses the neutral tone by default", () => {
    render(<Badge>Pendiente</Badge>);

    expect(screen.getByText("Pendiente")).toHaveClass(
      "top-badge",
      "top-badge--neutral",
    );
  });

  it("applies the requested semantic tone", () => {
    render(<Badge tone="success">Confirmada</Badge>);

    expect(screen.getByText("Confirmada")).toHaveClass(
      "top-badge--success",
    );
  });
});
