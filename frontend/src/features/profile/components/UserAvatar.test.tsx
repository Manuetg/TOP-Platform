import { render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { UserAvatar } from "./UserAvatar";

describe("UserAvatar", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["user", "lucide-user-round"],
    ["leaf", "lucide-leaf"],
    ["sun", "lucide-sun"],
    ["mountain", "lucide-mountain"],
  ] as const)("renders the %s catalog icon as decoration", (avatarId, iconClass) => {
    const { container } = render(<UserAvatar avatarId={avatarId} fallback="JS" />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveClass(iconClass);
    expect(icon).toHaveAttribute("data-profile-avatar", avatarId);
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
    expect(container).not.toHaveTextContent("JS");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each([null, undefined])("renders the supplied initials when the avatar is %s", (avatarId) => {
    const { container } = render(<UserAvatar avatarId={avatarId} fallback="JS" />);

    expect(container).toHaveTextContent(/^JS$/);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("removes the previous icon when cleared and accepts a later selection", () => {
    const { container, rerender } = render(<UserAvatar avatarId="leaf" fallback="TOP" />);
    expect(container.querySelector("svg")).toHaveAttribute("data-profile-avatar", "leaf");

    rerender(<UserAvatar avatarId={null} fallback="TOP" />);
    expect(container).toHaveTextContent(/^TOP$/);
    expect(container.querySelector("svg")).not.toBeInTheDocument();

    rerender(<UserAvatar avatarId="mountain" fallback="TOP" />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector("svg")).toHaveAttribute("data-profile-avatar", "mountain");
    expect(container).not.toHaveTextContent("TOP");
  });

  it("renders and updates without providers or network requests", () => {
    const request = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected avatar request"));
    const { rerender } = render(<UserAvatar avatarId="user" fallback="J" />);

    rerender(<UserAvatar avatarId="sun" fallback="J" />);
    rerender(<UserAvatar fallback="J" />);

    expect(request).not.toHaveBeenCalled();
  });
});
