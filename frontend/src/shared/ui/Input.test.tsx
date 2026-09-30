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
  it("conserva ayuda y error juntos al usar controles compartidos", () => {
    render(<Input id="amount" label="Importe" error="Importe inválido" aria-describedby="amount-help" />);
    expect(screen.getByRole("textbox", { name: "Importe" })).toHaveAttribute("aria-describedby", "amount-help amount-error");
  });

  it("muestra el prefijo dentro del campo sin incorporarlo al valor editable", () => {
    const { rerender } = render(<Input id="amount" label="Precio final" prefix="₲" value="" readOnly />);
    const input = screen.getByRole("textbox", { name: "Precio final" });
    expect(screen.getByText("₲")).toBeVisible();
    expect(screen.getByText("₲")).toHaveAttribute("aria-hidden", "true");
    expect(input).toHaveValue("");
    rerender(<Input id="amount" label="Precio final" prefix="₲" value="450.000" disabled readOnly />);
    expect(screen.getByText("₲")).toBeVisible();
    expect(input).toHaveValue("450.000");
  });

});
