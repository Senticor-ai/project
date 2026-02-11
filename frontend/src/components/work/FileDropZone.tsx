import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface FileDropZoneProps {
  onFilesDropped: (files: File[]) => void;
  allowedTypes?: string[];
  maxSizeMb?: number;
  multiple?: boolean;
  /** "static" shows a permanent dashed border + hint. "overlay" is invisible at rest, shows a translucent overlay on file drag. */
  variant?: "static" | "overlay";
  className?: string;
  children?: React.ReactNode;
}

function matchesType(fileType: string, pattern: string): boolean {
  if (pattern === fileType) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return fileType.startsWith(prefix);
  }
  return false;
}

export function FileDropZone({
  onFilesDropped,
  allowedTypes,
  maxSizeMb = 25,
  multiple = true,
  variant = "static",
  className,
  children,
}: FileDropZoneProps) {
  const isOverlay = variant === "overlay";
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const dragCounter = useRef(0);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const setErrorsWithTimer = useCallback(
    (newErrors: string[]) => {
      setErrors(newErrors);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(clearErrors, 5000);
    },
    [clearErrors],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only react to file drags — let dnd-kit own everything else
      if (!e.dataTransfer.types.includes("Files")) return;
      dragCounter.current++;
      setIsDragOver(true);
      if (errors.length > 0) clearErrors();
    },
    [errors.length, clearErrors],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      const filesToProcess = multiple ? droppedFiles : droppedFiles.slice(0, 1);

      const valid: File[] = [];
      const rejected: string[] = [];

      for (const file of filesToProcess) {
        const maxBytes = maxSizeMb * 1024 * 1024;
        if (file.size > maxBytes) {
          rejected.push(`${file.name}: too large (max ${maxSizeMb} MB)`);
          continue;
        }

        if (allowedTypes && allowedTypes.length > 0) {
          const typeOk = allowedTypes.some((pattern) =>
            matchesType(file.type, pattern),
          );
          if (!typeOk) {
            rejected.push(`${file.name}: type not allowed`);
            continue;
          }
        }

        valid.push(file);
      }

      if (rejected.length > 0) {
        setErrorsWithTimer(rejected);
      }

      if (valid.length > 0) {
        onFilesDropped(valid);
      }
    },
    [multiple, maxSizeMb, allowedTypes, onFilesDropped, setErrorsWithTimer],
  );

  return (
    <div
      data-testid="file-drop-zone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative",
        !isOverlay &&
          cn(
            "rounded-[var(--radius-lg)] border-2 border-dashed p-4 transition-colors duration-[var(--duration-fast)]",
            isDragOver
              ? "border-blueprint-400 bg-blueprint-50/30"
              : "border-border bg-transparent",
          ),
        className,
      )}
    >
      {children}

      {/* Overlay variant: translucent overlay on drag-over */}
      {isOverlay && isDragOver && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] bg-blueprint-50/40 backdrop-blur-sm">
          <Icon name="download" size={28} className="text-blueprint-500" />
          <p className="text-sm font-medium text-blueprint-600">
            Release to upload
          </p>
        </div>
      )}

      {/* Static variant: permanent hint */}
      {!isOverlay && (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <Icon
            name={isDragOver ? "download" : "upload_file"}
            size={24}
            className={cn(
              "transition-colors",
              isDragOver ? "text-blueprint-500" : "text-text-subtle",
            )}
          />
          <p className="text-sm text-text-muted">
            {isDragOver ? "Release to upload" : "Drop files here"}
          </p>
          {maxSizeMb && (
            <p className="text-xs text-text-subtle">Max {maxSizeMb} MB</p>
          )}
        </div>
      )}

      {/* Error messages */}
      {errors.length > 0 && (
        <div className={cn("space-y-1", isOverlay ? "mt-1" : "mt-2")}>
          {errors.map((err) => (
            <p key={err} className="text-xs text-status-error">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
