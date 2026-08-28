import { render, screen } from "@testing-library/react";
import { Input } from "./Input";

describe("Input", () => {
  it("associates the label with the input", () => {
    render(<Input label="Correo electrónico" name="email" />);

    expect(
      screen.getByRole("textbox", { name: "Correo electrónico" }),
    ).toBeInTheDocument();
  });

  it("exposes validation errors accessibly", () => {
    render(
      <Input
        label="Correo electrónico"
        name="email"
        error="El correo es obligatorio."
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Correo electrónico",
    });

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByText("El correo es obligatorio.")).toHaveAttribute(
      "id",
      "email-error",
    );
  });

  it("is not marked invalid when there is no error", () => {
    render(<Input label="Nombre" name="name" />);

    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });
});
