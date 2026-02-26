import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonRow } from "./PersonRow";
import { createPersonItem, resetFactoryCounter } from "@/model/factories";

beforeEach(() => resetFactoryCounter());

const basePerson = () =>
  createPersonItem({
    name: "Max Mustermann",
  });

describe("PersonRow", () => {
  it("renders person name", () => {
    render(
      <PersonRow item={basePerson()} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
  });

  it("renders 'Unnamed person' when name is missing", () => {
    const person = createPersonItem({ name: undefined as unknown as string });
    person.name = undefined;
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText("Unnamed person")).toBeInTheDocument();
  });

  it("calls onSelect when name is clicked", async () => {
    const user = userEvent.setup();
    const person = basePerson();
    const onSelect = vi.fn();
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={onSelect} />);
    await user.click(screen.getByText("Max Mustermann"));
    expect(onSelect).toHaveBeenCalledWith(person.id);
  });

  it("shows role badge when orgRole is set", () => {
    const person = createPersonItem({
      name: "Erika Musterfrau",
      orgRole: "founder",
    });
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    // getRoleLabel returns the i18n message for "person.role.founder"
    expect(screen.getByText(/founder/i)).toBeInTheDocument();
  });

  it("shows org badge when orgRef is set", () => {
    const person = createPersonItem({
      name: "Fritz",
      orgRef: { id: "org-1", name: "Bundesamt" },
    });
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText("Bundesamt")).toBeInTheDocument();
  });

  it("shows job title when set", () => {
    const person = createPersonItem({
      name: "Anna Schmidt",
      jobTitle: "Sachbearbeiterin",
    });
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText("Sachbearbeiterin")).toBeInTheDocument();
  });

  it("shows email link when set", () => {
    const person = createPersonItem({
      name: "Hans",
      email: "hans@example.de",
    });
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    const link = screen.getByText("hans@example.de");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "mailto:hans@example.de");
  });

  it("shows telephone link when set", () => {
    const person = createPersonItem({
      name: "Greta",
      telephone: "+49 30 1234567",
    });
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    const link = screen.getByText("+49 30 1234567");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "tel:+49 30 1234567");
  });

  it("shows actions menu and calls onArchive", async () => {
    const user = userEvent.setup();
    const person = basePerson();
    const onArchive = vi.fn();
    render(
      <PersonRow item={person} onArchive={onArchive} onSelect={vi.fn()} />,
    );
    await user.click(screen.getByLabelText("Person actions"));
    expect(screen.getByText("Archive")).toBeInTheDocument();
    await user.click(screen.getByText("Archive"));
    expect(onArchive).toHaveBeenCalledWith(person.id);
  });

  it("toggles menu open and closed", async () => {
    const user = userEvent.setup();
    render(
      <PersonRow item={basePerson()} onArchive={vi.fn()} onSelect={vi.fn()} />,
    );
    const btn = screen.getByLabelText("Person actions");
    await user.click(btn);
    expect(screen.getByText("Archive")).toBeInTheDocument();
    // Clicking again closes
    await user.click(btn);
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });

  it("does not show contact row when no contact info is set", () => {
    const person = basePerson();
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    // No mailto or tel links
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("returns fallback role color for unknown role", () => {
    const person = createPersonItem({
      name: "Test",
      orgRole: "unknown-role" as never,
    });
    render(<PersonRow item={person} onArchive={vi.fn()} onSelect={vi.fn()} />);
    // Should render the role text as-is
    expect(screen.getByText("unknown-role")).toBeInTheDocument();
  });
});
