import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrgDocEditor, OrgDocTypeIcon } from "./OrgDocEditor";
import { createOrgDocItem, resetFactoryCounter } from "@/model/factories";

const mockMutate = vi.fn();
const mockAppendMutate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: { file_content: "existing content" },
    isLoading: false,
  })),
}));

vi.mock("@/hooks/use-mutations", () => ({
  usePatchFileContent: () => ({ mutate: mockMutate, isPending: false }),
  useAppendContent: () => ({ mutate: mockAppendMutate, isPending: false }),
}));

beforeEach(() => {
  resetFactoryCounter();
  mockMutate.mockClear();
  mockAppendMutate.mockClear();
});

describe("OrgDocTypeIcon", () => {
  it("renders icon for general doc type", () => {
    const { container } = render(<OrgDocTypeIcon docType="general" />);
    expect(container.querySelector("span")).toHaveTextContent("description");
  });

  it("renders icon for user doc type", () => {
    const { container } = render(<OrgDocTypeIcon docType="user" />);
    expect(container.querySelector("span")).toHaveTextContent("person");
  });

  it("renders icon for log doc type", () => {
    const { container } = render(<OrgDocTypeIcon docType="log" />);
    expect(container.querySelector("span")).toHaveTextContent("history");
  });

  it("renders icon for agent doc type", () => {
    const { container } = render(<OrgDocTypeIcon docType="agent" />);
    expect(container.querySelector("span")).toHaveTextContent("smart_toy");
  });
});

describe("OrgDocEditor", () => {
  it("shows loading state", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    const item = createOrgDocItem({ name: "Notes", orgDocType: "general" });
    render(<OrgDocEditor item={item} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders editable textarea for general doc type", () => {
    const item = createOrgDocItem({
      name: "General Doc",
      orgDocType: "general",
    });
    render(<OrgDocEditor item={item} />);
    const textarea = screen.getByLabelText("Edit General Doc");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("existing content");
  });

  it("renders editable textarea for user doc type", () => {
    const item = createOrgDocItem({ name: "User Doc", orgDocType: "user" });
    render(<OrgDocEditor item={item} />);
    expect(screen.getByLabelText("Edit User Doc")).toBeInTheDocument();
  });

  it("calls patchMutation on blur when content changed", async () => {
    const user = userEvent.setup();
    const item = createOrgDocItem({ name: "Doc", orgDocType: "general" });
    render(<OrgDocEditor item={item} />);

    const textarea = screen.getByLabelText("Edit Doc");
    await user.clear(textarea);
    await user.type(textarea, "updated content");
    await user.tab(); // triggers blur

    expect(mockMutate).toHaveBeenCalledWith({
      itemId: item.id,
      text: "updated content",
    });
  });

  it("does not call patchMutation on blur when content unchanged", async () => {
    const user = userEvent.setup();
    const item = createOrgDocItem({ name: "Doc", orgDocType: "general" });
    render(<OrgDocEditor item={item} />);

    const textarea = screen.getByLabelText("Edit Doc");
    // Click and blur without changing
    await user.click(textarea);
    await user.tab();

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("renders log view with content and append input", () => {
    const item = createOrgDocItem({ name: "Activity Log", orgDocType: "log" });
    render(<OrgDocEditor item={item} />);
    expect(screen.getByText("existing content")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/log entry/i)).toBeInTheDocument();
  });

  it("renders empty log message when no content", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValueOnce({
      data: { file_content: "" },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    const item = createOrgDocItem({ name: "Empty Log", orgDocType: "log" });
    render(<OrgDocEditor item={item} />);
    expect(screen.getByText("No log entries yet.")).toBeInTheDocument();
  });

  it("appends text on Enter in log mode", async () => {
    const user = userEvent.setup();
    const item = createOrgDocItem({ name: "Log", orgDocType: "log" });
    render(<OrgDocEditor item={item} />);

    const input = screen.getByPlaceholderText(/log entry/i);
    await user.type(input, "new entry{Enter}");

    expect(mockAppendMutate).toHaveBeenCalledWith({
      itemId: item.id,
      text: "new entry",
    });
  });

  it("appends text on button click in log mode", async () => {
    const user = userEvent.setup();
    const item = createOrgDocItem({ name: "Log", orgDocType: "log" });
    render(<OrgDocEditor item={item} />);

    const input = screen.getByPlaceholderText(/log entry/i);
    await user.type(input, "button entry");
    await user.click(screen.getByRole("button", { name: /add entry/i }));

    expect(mockAppendMutate).toHaveBeenCalledWith({
      itemId: item.id,
      text: "button entry",
    });
  });

  it("does not append empty text", async () => {
    const user = userEvent.setup();
    const item = createOrgDocItem({ name: "Log", orgDocType: "log" });
    render(<OrgDocEditor item={item} />);

    const input = screen.getByPlaceholderText(/log entry/i);
    await user.type(input, "   {Enter}");

    expect(mockAppendMutate).not.toHaveBeenCalled();
  });

  it("renders agent doc as read-only with content", () => {
    const item = createOrgDocItem({ name: "Agent Notes", orgDocType: "agent" });
    render(<OrgDocEditor item={item} />);
    expect(screen.getByText("existing content")).toBeInTheDocument();
    // No textarea or input
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders agent doc empty state", async () => {
    const { useQuery } = await import("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValueOnce({
      data: { file_content: "" },
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    const item = createOrgDocItem({ name: "Agent", orgDocType: "agent" });
    render(<OrgDocEditor item={item} />);
    expect(
      screen.getByText("Agent has not written any notes yet."),
    ).toBeInTheDocument();
  });

  it("shows last updated for agent doc with content", () => {
    const item = createOrgDocItem({ name: "Agent", orgDocType: "agent" });
    render(<OrgDocEditor item={item} />);
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });
});
