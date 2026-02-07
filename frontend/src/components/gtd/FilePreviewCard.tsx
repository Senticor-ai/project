import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface FileConfirmMeta {
  file: File;
  title: string;
  notes: string;
  tags: string[];
  targetBucket: "reference" | "inbox";
}

export interface FilePreviewCardProps {
  file: File;
  onConfirm: (meta: FileConfirmMeta) => void;
  onDiscard: () => void;
  targetBucket?: "reference" | "inbox";
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "picture_as_pdf";
  if (contentType.startsWith("text/")) return "article";
  return "description";
}

function filenameWithoutExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

export function FilePreviewCard({
  file,
  onConfirm,
  onDiscard,
  targetBucket = "reference",
  className,
}: FilePreviewCardProps) {
  const [title, setTitle] = useState(() => filenameWithoutExtension(file.name));
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const isImage = file.type.startsWith("image/");
  const thumbnailUrl = useMemo(
    () => (isImage ? URL.createObjectURL(file) : null),
    [file, isImage],
  );

  useEffect(() => {
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl]);

  const handleConfirm = () => {
    onConfirm({ file, title, notes, tags, targetBucket });
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const buttonLabel =
    targetBucket === "inbox" ? "Add to Inbox" : "Add to Reference";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface-raised p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {/* File info header */}
      <div className="flex items-start gap-3">
        {/* Thumbnail or icon */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt="Preview"
            className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-paper-100">
            <Icon
              name={fileIcon(file.type)}
              size={28}
              className="text-text-subtle"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{file.name}</p>
          <p className="text-xs text-text-muted">{formatFileSize(file.size)}</p>
        </div>
      </div>

      {/* Editable fields */}
      <div className="mt-4 space-y-3">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
            className="w-full rounded-[var(--radius-md)] border border-border bg-transparent px-2 py-1.5 text-sm text-text outline-none focus:border-blueprint-400"
          />
        </div>

        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Notes"
            placeholder="Add notes..."
            rows={2}
            className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-transparent px-2 py-1.5 text-sm text-text outline-none placeholder:text-text-subtle focus:border-blueprint-400"
          />
        </div>

        {/* Tags */}
        <div>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-paper-200 px-2 py-0.5 text-xs text-text-muted"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="text-text-subtle hover:text-text"
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag();
              }
            }}
            aria-label="Add tag"
            placeholder="Add tag..."
            className="mt-1 w-full bg-transparent text-xs text-text outline-none placeholder:text-text-subtle"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onDiscard}
          className="rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-text-muted hover:text-text"
        >
          Discard
        </button>
        <button
          onClick={handleConfirm}
          className="rounded-[var(--radius-md)] bg-blueprint-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blueprint-600"
        >
          {buttonLabel}
        </button>
      </div>
    </motion.div>
  );
}
