import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesPanel } from "./PreferencesPanel";
import { DEFAULT_PREFERENCES } from "@/model/settings-types";

describe("PreferencesPanel", () => {
  it("renders language select with current value", () => {
    render(
      <PreferencesPanel preferences={DEFAULT_PREFERENCES} onChange={vi.fn()} />,
    );
    const select = screen.getByLabelText("Language");
    expect(select).toHaveValue("de");
  });

  it("calls onChange when language changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PreferencesPanel
        preferences={DEFAULT_PREFERENCES}
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Language"), "en");
    expect(onChange).toHaveBeenCalledWith({ language: "en" });
  });

  it("renders time format button group with active selection", () => {
    render(
      <PreferencesPanel preferences={DEFAULT_PREFERENCES} onChange={vi.fn()} />,
    );
    const btn24 = screen.getByRole("button", { name: "24h" });
    const btn12 = screen.getByRole("button", { name: "12h" });
    expect(btn24).toHaveAttribute("aria-pressed", "true");
    expect(btn12).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange when time format button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PreferencesPanel
        preferences={DEFAULT_PREFERENCES}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "12h" }));
    expect(onChange).toHaveBeenCalledWith({ timeFormat: "12h" });
  });

  it("renders date format select", () => {
    render(
      <PreferencesPanel preferences={DEFAULT_PREFERENCES} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Date format")).toHaveValue("DD.MM.YYYY");
  });

  it("renders week start select", () => {
    render(
      <PreferencesPanel preferences={DEFAULT_PREFERENCES} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Week start")).toHaveValue("monday");
  });

  it("renders default bucket select", () => {
    render(
      <PreferencesPanel preferences={DEFAULT_PREFERENCES} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Default view")).toHaveValue("inbox");
  });

  it("renders theme button group", () => {
    render(
      <PreferencesPanel preferences={DEFAULT_PREFERENCES} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggles weekly review and shows day select", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PreferencesPanel
        preferences={DEFAULT_PREFERENCES}
        onChange={onChange}
      />,
    );
    // review day should be hidden when review is disabled
    expect(screen.queryByLabelText("Review day")).not.toBeInTheDocument();

    // enable review
    await user.click(screen.getByLabelText("Weekly review reminder"));
    expect(onChange).toHaveBeenCalledWith({ weeklyReviewEnabled: true });
  });

  it("shows review day select when review is enabled", () => {
    render(
      <PreferencesPanel
        preferences={{ ...DEFAULT_PREFERENCES, weeklyReviewEnabled: true }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Review day")).toBeInTheDocument();
  });
});
