import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { ItemEditor } from "./ItemEditor";
import type {
  ReferenceMaterial,
  ReferenceOrigin,
  ItemEditableFields,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ReferenceRowProps {
  reference: ReferenceMaterial;
  onArchive: (id: CanonicalId) => void;
  onSelect: (id: CanonicalId) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEdit?: (id: CanonicalId, fields: Partial<ItemEditableFields>) => void;
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

function referenceToEditorValues(ref: ReferenceMaterial): ItemEditableFields {
  return {
    contexts: [],
    description: ref.description,
  };
}

export function ReferenceRow({
  reference,
  onArchive,
  onSelect,
  isExpanded = false,
  onToggleExpand,
  onEdit,
  className,
}: ReferenceRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const origin = reference.origin ? originConfig[reference.origin] : null;

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
        className,
      )}
    >
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
          />
        </div>
      )}
    </div>
  );
}
