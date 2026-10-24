import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionButton } from "./ActionButton";

afterEach(cleanup);

describe("ActionButton", () => {
  it("preserves its label and forwards a deliberate action", () => {
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick}>Save changes</ActionButton>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate actions while busy and re-enables when the caller finishes", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <ActionButton busy onClick={onClick}>
        Signing in…
      </ActionButton>,
    );
    const button = screen.getByRole("button", { name: "Signing in…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    rerender(<ActionButton onClick={onClick}>Sign in</ActionButton>);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("respects external disabled state and submit semantics", () => {
    render(
      <ActionButton disabled type="submit">
        Submit claim
      </ActionButton>,
    );
    expect(screen.getByRole("button", { name: "Submit claim" })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
