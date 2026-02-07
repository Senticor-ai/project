import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs";

const sampleTabs = [
  { id: "one", label: "Tab One", icon: "inbox" },
  { id: "two", label: "Tab Two", icon: "label" },
  { id: "three", label: "Tab Three", icon: "tune" },
];

describe("Tabs", () => {
  it("renders all tab labels", () => {
    render(<Tabs tabs={sampleTabs} activeTab="one" onSelect={vi.fn()} />);
    expect(screen.getByText("Tab One")).toBeInTheDocument();
    expect(screen.getByText("Tab Two")).toBeInTheDocument();
    expect(screen.getByText("Tab Three")).toBeInTheDocument();
  });

  it("has role=tablist on container", () => {
    render(<Tabs tabs={sampleTabs} activeTab="one" onSelect={vi.fn()} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("renders each tab with role=tab", () => {
    render(<Tabs tabs={sampleTabs} activeTab="one" onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("sets aria-selected=true on active tab", () => {
    render(<Tabs tabs={sampleTabs} activeTab="two" onSelect={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with tab id when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Tabs tabs={sampleTabs} activeTab="one" onSelect={onSelect} />);
    await user.click(screen.getByText("Tab Two"));
    expect(onSelect).toHaveBeenCalledWith("two");
  });

  it("renders icons for each tab", () => {
    render(<Tabs tabs={sampleTabs} activeTab="one" onSelect={vi.fn()} />);
    const icons = document.querySelectorAll(".material-symbols-outlined");
    expect(icons).toHaveLength(3);
  });

  it("uses vertical orientation by default", () => {
    render(<Tabs tabs={sampleTabs} activeTab="one" onSelect={vi.fn()} />);
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-orientation", "vertical");
  });

  it("supports horizontal orientation", () => {
    render(
      <Tabs
        tabs={sampleTabs}
        activeTab="one"
        onSelect={vi.fn()}
        orientation="horizontal"
      />,
    );
    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-orientation", "horizontal");
  });
});
