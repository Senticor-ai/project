import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { BucketBadge } from "@/components/paperclip/BucketBadge";
import { getFileUrl } from "@/lib/api-client";
import { ItemEditor } from "./ItemEditor";
import type {
  ReferenceMaterial,
  ReferenceOrigin,
  ActionItemBucket,
  ItemEditableFields,
  Project,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ReferenceRowProps {
  reference: ReferenceMaterial;
  onArchive: (id: CanonicalId) => void;
  onSelect: (id: CanonicalId) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
  /** Bucket where the linked ReadAction lives (shown as a badge). */
  linkedActionBucket?: ActionItemBucket;
  projects?: Pick<Project, "id" | "name">[];
  className?: string;
}

const originConfig: Record<
  ReferenceOrigin,
  { label: string; icon: string; className: string }
> = {
  triaged: {
    label: "Triaged",
    icon: "move_item",
    className: "text-app-inbox",
  },
  captured: {
    label: "Captured",
    icon: "edit_note",
    className: "text-app-reference",
  },
  file: {
    label: "File",
    icon: "attach_file",
    className: "text-blueprint-500",
  },
};

function formatEncodingFormat(encodingFormat: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "text/plain": "TXT",
    "text/html": "HTML",
    "text/markdown": "MD",
    "image/png": "PNG",
    "image/jpeg": "JPG",
    "image/gif": "GIF",
  };
  return (
    map[encodingFormat] ??
    encodingFormat.split("/").pop()?.toUpperCase() ??
    encodingFormat
  );
}

/** Formats that browsers can render inline in a new tab. */
const BROWSER_VIEWABLE = new Set([
  "application/pdf",
  "text/plain",
  "text/html",
  "text/csv",
  "text/xml",
  "application/xml",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "image/webp",
]);

function isBrowserViewable(encodingFormat: string | undefined): boolean {
  if (!encodingFormat) return false;
  return BROWSER_VIEWABLE.has(encodingFormat);
}

function referenceToEditorValues(ref: ReferenceMaterial): ItemEditableFields {
  return {
    contexts: [],
    description: ref.description,
    projectId: ref.projectIds[0],
  };
}

export function ReferenceRow({
  reference,
  onArchive,
  onSelect,
  isExpanded = false,
  onToggleExpand,
  onEdit,
  linkedActionBucket,
  projects,
  className,
}: ReferenceRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const origin = reference.origin ? originConfig[reference.origin] : null;
  const projectName = projects?.find(
    (p) => p.id === reference.projectIds[0],
  )?.name;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: reference.id,
    data: { type: "reference", thing: reference },
  });

  const handleTitleClick = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      onSelect(reference.id);
    }
  };

  const handleEditorChange = (fields: Partial<ItemEditableFields>) => {
    onEdit?.(reference.id, fields);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5",
        "transition-colors duration-[var(--duration-fast)]",
        "hover:bg-paper-100",
        isDragging && "opacity-50",
        className,
      )}
    >
      {/* Drag handle */}
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Drag ${reference.name ?? "Untitled"}`}
        className="hidden cursor-grab text-text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 md:inline"
      >
        <Icon name="drag_indicator" size={14} />
      </span>

      {/* Title — clickable */}
      <button
        onClick={handleTitleClick}
        className="flex-1 whitespace-pre-wrap text-left text-sm font-medium text-text"
      >
        {reference.name ?? "Untitled"}
      </button>

      {/* Content type chip */}
      {reference.encodingFormat && (
        <span className="shrink-0 rounded-[var(--radius-sm)] bg-paper-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-muted">
          {formatEncodingFormat(reference.encodingFormat)}
        </span>
      )}

      {/* Origin badge */}
      {origin && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-0.5 text-xs",
            origin.className,
          )}
        >
          <Icon name={origin.icon} size={14} />
          {origin.label}
        </span>
      )}

      {/* Project badge */}
      {projectName && (
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-blueprint-500">
          <Icon name="folder" size={14} />
          {projectName}
        </span>
      )}

      {/* Linked action bucket badge (split-on-triage) */}
      {linkedActionBucket && (
        <BucketBadge bucket={linkedActionBucket} className="shrink-0" />
      )}

      {/* Note indicator */}
      {reference.description && (
        <button
          onClick={() =>
            onToggleExpand ? onToggleExpand() : onSelect(reference.id)
          }
          aria-label={`Show notes for ${reference.name ?? "Untitled"}`}
          className="shrink-0 text-text-subtle hover:text-text"
        >
          <Icon name="description" size={14} />
        </button>
      )}

      {/* External URL link */}
      {reference.url && (
        <a
          href={reference.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open external link"
          className="shrink-0 text-text-subtle hover:text-blueprint-500"
        >
          <Icon name="open_in_new" size={14} />
        </a>
      )}

      {/* View in browser (only for formats browsers can render inline) */}
      {reference.downloadUrl && isBrowserViewable(reference.encodingFormat) && (
        <a
          href={`${getFileUrl(reference.downloadUrl)}?inline=true`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View file"
          className="shrink-0 text-text-subtle hover:text-blueprint-500"
        >
          <Icon name="visibility" size={14} />
        </a>
      )}

      {/* Download file */}
      {reference.downloadUrl && (
        <a
          href={getFileUrl(reference.downloadUrl)}
          target="_blank"
          rel="noopener noreferrer"
          download
          aria-label="Download file"
          className="shrink-0 text-text-subtle hover:text-blueprint-500"
        >
          <Icon name="download" size={14} />
        </a>
      )}

      {/* Actions menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={`Actions for ${reference.name ?? "Untitled"}`}
          aria-expanded={menuOpen}
          className="shrink-0 text-text-subtle opacity-0 hover:text-text group-hover:opacity-100"
        >
          <Icon name="more_vert" size={16} />
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-[var(--radius-md)] border border-border bg-surface-raised p-1 shadow-[var(--shadow-sheet)]"
            role="menu"
          >
            <button
              role="menuitem"
              onClick={() => {
                onArchive(reference.id);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-paper-100"
            >
              <Icon name="archive" size={14} />
              Archive
            </button>
          </div>
        )}
      </div>

      {/* Inline editor */}
      {isExpanded && onEdit && (
        <div className="mt-1 ml-8">
          <ItemEditor
            values={referenceToEditorValues(reference)}
            onChange={handleEditorChange}
            projects={projects}
          />
        </div>
      )}
    </div>
  );
}
