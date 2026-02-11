import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FilesApi, ImportsApi } from "@/lib/api-client";
import type {
  ImportSummary,
  ImportJobResponse,
  FileRecord,
  FileInitiateResponse,
} from "@/lib/api-client";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { NativeImportDialog } from "./NativeImportDialog";

vi.mock("@/lib/api-client", () => ({
  FilesApi: {
    initiate: vi.fn(),
    uploadChunk: vi.fn(),
    complete: vi.fn(),
  },
  ImportsApi: {
    inspectNative: vi.fn(),
    importNativeFromFile: vi.fn(),
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

const SUMMARY: ImportSummary = {
  total: 100,
  created: 80,
  updated: 10,
  skipped: 5,
  errors: 5,
  bucket_counts: { inbox: 10, next: 60, waiting: 5, someday: 5, reference: 20 },
  completed_counts: { next: 45, waiting: 2 },
  sample_errors: ["item[42] missing name"],
};

const JOB_COMPLETED: ImportJobResponse = {
  job_id: "job-1",
  status: "completed",
  file_id: "file-abc",
  file_sha256: null,
  source: "native",
  created_at: "2026-02-06T12:00:00Z",
  updated_at: "2026-02-06T12:01:00Z",
  started_at: "2026-02-06T12:00:01Z",
  finished_at: "2026-02-06T12:01:00Z",
  summary: SUMMARY,
  progress: null,
  error: null,
  archived_at: null,
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof NativeImportDialog>> = {},
) {
  const onClose = props.onClose ?? vi.fn();
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
        <ToastProvider>
          <NativeImportDialog open onClose={onClose} {...props} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

describe("NativeImportDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFiles.initiate.mockResolvedValue(INITIATE);
    mockedFiles.uploadChunk.mockResolvedValue({ received: 500 });
    mockedFiles.complete.mockResolvedValue(FILE_RECORD);
    mockedImports.inspectNative.mockResolvedValue(SUMMARY);
    mockedImports.importNativeFromFile.mockResolvedValue({
      ...JOB_COMPLETED,
      status: "queued",
      summary: null,
      finished_at: null,
    });
    mockedImports.getJob.mockResolvedValue(JOB_COMPLETED);
  });

  it("renders file drop zone when open", () => {
    renderDialog();
    expect(
      screen.getByText("Drop TerminAndoYo export here"),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <NativeImportDialog open={false} onClose={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(
      container.querySelector("[data-testid='native-file-input']"),
    ).not.toBeInTheDocument();
  });

  it("shows preview after file upload", async () => {
    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("native-file-input");
    const file = new File(["[{}]"], "export.json", {
      type: "application/json",
    });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(
        screen.getByText("100 items found", { exact: true }),
      ).toBeInTheDocument();
    });

    expect(mockedImports.inspectNative).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: "file-abc" }),
    );
  });

  it(
    "shows import results after import completes",
    { timeout: 15_000 },
    async () => {
      const user = userEvent.setup();
      renderDialog();

      const fileInput = screen.getByTestId("native-file-input");
      const file = new File(["[{}]"], "export.json", {
        type: "application/json",
      });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(
          screen.getByText("100 items found", { exact: true }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /import/i }));

      await waitFor(() => {
        expect(screen.getByText(/80/)).toBeInTheDocument(); // created
      });
    },
  );

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it("returns to select step when upload fails", async () => {
    mockedFiles.initiate.mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("native-file-input");
    const file = new File(["[{}]"], "export.json", {
      type: "application/json",
    });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(
        screen.getByText("Drop TerminAndoYo export here"),
      ).toBeInTheDocument();
    });
  });

  it("returns to preview step when import fails", async () => {
    mockedImports.importNativeFromFile.mockRejectedValueOnce(
      new Error("Server error"),
    );
    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("native-file-input");
    const file = new File(["[{}]"], "export.json", {
      type: "application/json",
    });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(
        screen.getByText("100 items found", { exact: true }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /import/i }));

    await waitFor(() => {
      expect(
        screen.getByText("100 items found", { exact: true }),
      ).toBeInTheDocument();
    });
  });

  it("shows error state when job fails", async () => {
    const JOB_FAILED: ImportJobResponse = {
      ...JOB_COMPLETED,
      status: "failed",
      error: "Worker timeout exceeded",
      summary: SUMMARY,
    };
    mockedImports.getJob.mockResolvedValue(JOB_FAILED);

    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("native-file-input");
    const file = new File(["[{}]"], "export.json", {
      type: "application/json",
    });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(
        screen.getByText("100 items found", { exact: true }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /import/i }));

    await waitFor(() => {
      expect(screen.getByText("Import failed")).toBeInTheDocument();
      expect(screen.getByText("Worker timeout exceeded")).toBeInTheDocument();
    });
  });

  it("shows errors from sample_errors in preview", async () => {
    const user = userEvent.setup();
    renderDialog();

    const fileInput = screen.getByTestId("native-file-input");
    const file = new File(["[{}]"], "export.json", {
      type: "application/json",
    });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/item\[42\] missing name/)).toBeInTheDocument();
    });
  });

  it("does not trigger upload when file input has no file", async () => {
    renderDialog();
    const fileInput = screen.getByTestId(
      "native-file-input",
    ) as HTMLInputElement;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      screen.getByText("Drop TerminAndoYo export here"),
    ).toBeInTheDocument();
    expect(mockedFiles.initiate).not.toHaveBeenCalled();
  });
});
