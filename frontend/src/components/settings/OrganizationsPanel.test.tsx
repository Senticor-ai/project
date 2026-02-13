import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrganizationsPanel } from "./OrganizationsPanel";
import type { OrgResponse } from "@/lib/api-client";

const sampleOrgs: OrgResponse[] = [
  {
    id: "org-1",
    name: "Nueva Tierra",
    role: "owner",
    created_at: "2025-01-15T10:00:00Z",
  },
  {
    id: "org-2",
    name: "Autonomo Wolfgang",
    role: "member",
    created_at: "2025-03-20T10:00:00Z",
  },
];

describe("OrganizationsPanel", () => {
  const noop = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it("renders header", () => {
    render(<OrganizationsPanel />);
    expect(screen.getByText("Organizations")).toBeInTheDocument();
  });

  it("shows empty state when no organizations", () => {
    render(<OrganizationsPanel />);
    expect(screen.getByText(/No organizations yet/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<OrganizationsPanel isLoading />);
    expect(screen.getByText(/Loading organizations/)).toBeInTheDocument();
  });

  it("renders organization list", () => {
    render(<OrganizationsPanel organizations={sampleOrgs} />);
    expect(screen.getByText("Nueva Tierra")).toBeInTheDocument();
    expect(screen.getByText("Autonomo Wolfgang")).toBeInTheDocument();
  });

  it("shows owner badge for owner role", () => {
    render(<OrganizationsPanel organizations={sampleOrgs} />);
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows add organization button when onCreateOrg provided", () => {
    render(<OrganizationsPanel onCreateOrg={noop} />);
    expect(screen.getByText("Add organization")).toBeInTheDocument();
  });

  it("does not show add button when onCreateOrg not provided", () => {
    render(<OrganizationsPanel />);
    expect(screen.queryByText("Add organization")).not.toBeInTheDocument();
  });

  it("shows form when add button clicked", async () => {
    const user = userEvent.setup();
    render(<OrganizationsPanel onCreateOrg={noop} />);
    await user.click(screen.getByText("Add organization"));
    expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
  });

  it("calls onCreateOrg when form submitted", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<OrganizationsPanel onCreateOrg={onCreate} />);

    await user.click(screen.getByText("Add organization"));
    await user.type(
      screen.getByLabelText("Organization name"),
      "New Org{Enter}",
    );

    expect(onCreate).toHaveBeenCalledWith("New Org");
  });

  it("closes form and clears input after submit", async () => {
    const user = userEvent.setup();
    render(<OrganizationsPanel onCreateOrg={noop} />);

    await user.click(screen.getByText("Add organization"));
    await user.type(
      screen.getByLabelText("Organization name"),
      "New Org{Enter}",
    );

    // Form is hidden, back to "Add organization" button
    expect(screen.getByText("Add organization")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Organization name"),
    ).not.toBeInTheDocument();
  });

  it("closes form on cancel", async () => {
    const user = userEvent.setup();
    render(<OrganizationsPanel onCreateOrg={noop} />);

    await user.click(screen.getByText("Add organization"));
    await user.click(screen.getByText("Cancel"));

    expect(screen.getByText("Add organization")).toBeInTheDocument();
  });

  it("closes form on escape", async () => {
    const user = userEvent.setup();
    render(<OrganizationsPanel onCreateOrg={noop} />);

    await user.click(screen.getByText("Add organization"));
    await user.keyboard("{Escape}");

    expect(screen.getByText("Add organization")).toBeInTheDocument();
  });
});
