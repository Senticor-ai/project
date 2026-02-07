import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FilesApi, ImportsApi } from "@/lib/api-client";
import type {
  NirvanaImportSummary,
  ImportJobResponse,
  FileRecord,
  FileInitiateResponse,
} from "@/lib/api-client";
import { NirvanaImportDialog } from "./NirvanaImportDialog";

vi.mock("@/lib/api-client", () => ({
  FilesApi: {
    initiate: vi.fn(),
    uploadChunk: vi.fn(),
    complete: vi.fn(),
  },
  ImportsApi: {
    inspectNirvana: vi.fn(),
    importNirvanaFromFile: vi.fn(),
    getJob: vi.fn(),
  },
}));

const mockedFiles = vi.mocked(FilesApi);
const mockedImports = vi.mocked(ImportsApi);

const INITIATE: FileInitiateResponse = {
  upload_id: "up-1",
  upload_url: "/files/upload/up-1",
  chunk_size: 100000,
  chunk_total: 1,
  expires_at: "2026-02-07T00:00:00Z",
};

const FILE_RECORD: FileRecord = {
  file_id: "file-abc",
  original_name: "export.json",
  content_type: "application/json",
  size_bytes: 500,
  sha256: "abc",
  created_at: "2026-02-06T12:00:00Z",
  download_url: "/files/file-abc",
};

const SUMMARY: NirvanaImportSummary = {
  total: 100,
  created: 80,
  updated: 10,
  skipped: 5,
  errors: 5,
  bucket_counts: { inbox: 10, next: 60, waiting: 5, someday: 5, reference: 20 },
  sample_errors: ["item[42] missing name"],
};

const JOB_COMPLETED: ImportJobResponse = {
  job_id: "job-1",
  status: "completed",
  file_id: "file-abc",
  source: "nirvana",
  created_at: "2026-02-06T12:00:00Z",
  updated_at: "2026-02-06T12:01:00Z",
  started_at: "2026-02-06T12:00:01Z",
  finished_at: "2026-02-06T12:01:00Z",
  summary: SUMMARY,
  error: null,
};

function renderDialog(onClose = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <NirvanaImportDialog open onClose={onClose} />
      </QueryClientProvider>,
    ),
  };
}

describe("NirvanaImportDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFiles.initiate.mockResolvedValue(INITIATE);
    mockedFiles.uploadChunk.mockResolvedValue({ received: 500 });
    mockedFiles.complete.mockResolvedValue(FILE_RECORD);
    mockedImports.inspectNirvana.mockResolvedValue(SUMMARY);
    mockedImports.importNirvanaFromFile.mockResolvedValue({
      ...JOB_COMPLETED,
      status: "queued",
      summary: null,
      finished_at: null,
    });
    mockedImports.getJob.mockResolvedValue(JOB_COMPLETED);
  });

  it("renders file drop zone when open", () => {
    renderDialog();
    expect(screen.getByText("Drop Nirvana export here")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <NirvanaImportDialog open={false} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("shows preview after file upload", async () => {
    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("nirvana-file-input");
    const file = new File(
      ['[{"id":"1","name":"test","type":0,"state":1}]'],
      "export.json",
      {
        type: "application/json",
      },
    );
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/100 items/i)).toBeInTheDocument();
    });

    expect(mockedImports.inspectNirvana).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: "file-abc" }),
    );
  });

  it("shows bucket breakdown in preview", async () => {
    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("nirvana-file-input");
    const file = new File(["[]"], "export.json", { type: "application/json" });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/next/i)).toBeInTheDocument();
      expect(screen.getByText("60")).toBeInTheDocument();
    });
  });

  it("shows import results after import completes", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Upload file
    const fileInput = screen.getByTestId("nirvana-file-input");
    const file = new File(["[]"], "export.json", { type: "application/json" });
    await user.upload(fileInput, file);

    // Wait for preview
    await waitFor(() => {
      expect(screen.getByText(/100 items/i)).toBeInTheDocument();
    });

    // Click import
    const importButton = screen.getByRole("button", { name: /import/i });
    await user.click(importButton);

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText(/80/)).toBeInTheDocument(); // created
    });
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it("shows errors from sample_errors", async () => {
    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("nirvana-file-input");
    const file = new File(["[]"], "export.json", { type: "application/json" });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/item\[42\] missing name/)).toBeInTheDocument();
    });
  });
});
