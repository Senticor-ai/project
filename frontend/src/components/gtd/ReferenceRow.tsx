import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { ReferenceMaterial, ReferenceOrigin } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ReferenceRowProps {
  reference: ReferenceMaterial;
  onArchive: (id: CanonicalId) => void;
  onSelect: (id: CanonicalId) => void;
  className?: string;
}

const originConfig: Record<
  ReferenceOrigin,
  { label: string; icon: string; className: string }
> = {
  triaged: {
    label: "Triaged",
    icon: "move_item",
    className: "text-gtd-inbox",
  },
  captured: {
    label: "Captured",
    icon: "edit_note",
    className: "text-gtd-reference",
  },
  file: {
    label: "File",
    icon: "attach_file",
    className: "text-blueprint-500",
  },
};

function formatContentType(contentType: string): string {
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
    map[contentType] ??
    contentType.split("/").pop()?.toUpperCase() ??
    contentType
  );
}

export function ReferenceRow({
  reference,
  onArchive,
  onSelect,
  className,
}: ReferenceRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const origin = reference.origin ? originConfig[reference.origin] : null;

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
        onClick={() => onSelect(reference.id)}
        className="flex-1 truncate text-left text-sm font-medium text-text"
      >
        {reference.title}
      </button>

      {/* Content type chip */}
      {reference.contentType && (
        <span className="shrink-0 rounded-[var(--radius-sm)] bg-paper-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-muted">
          {formatContentType(reference.contentType)}
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
      {reference.notes && (
        <span aria-label="Has notes" className="shrink-0 text-text-subtle">
          <Icon name="description" size={14} />
        </span>
      )}

      {/* External URL link */}
      {reference.externalUrl && (
        <a
          href={reference.externalUrl}
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
          aria-label={`Actions for ${reference.title}`}
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
    </div>
  );
}
