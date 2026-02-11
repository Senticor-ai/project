import { useState, useRef, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import type { BaseEntity } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ItemListHeaderConfig {
  icon: string;
  label: string;
  subtitle: string;
}

export interface ItemListRapidEntryConfig {
  placeholder: string;
  ariaLabel: string;
  onAdd: (title: string) => Promise<void> | void;
  /** Show error alert when async onAdd rejects. Default false. */
  showCaptureErrors?: boolean;
}

export interface ItemListSecondarySectionConfig<T extends BaseEntity> {
  /** Label shown in the collapsible header, e.g. "Done" or "Archived" */
  label: string;
  /** Secondary items to display when expanded */
  items: T[];
  /** Whether the data is still loading */
  isLoading?: boolean;
  /** Render function for each secondary item */
  renderItem: (item: T) => ReactNode;
  /** Optional className on the items wrapper (e.g. "opacity-60") */
  wrapperClassName?: string;
}

export interface ItemListFooterConfig {
  /** Returns display text for the active item count, e.g. "3 actions" */
  formatCount: (count: number) => string;
}

export interface ItemListProps<T extends BaseEntity> {
  /** Primary items — already filtered and sorted by the wrapper */
  items: T[];
  /** Header configuration */
  header: ItemListHeaderConfig;
  /** Rapid entry input. Omit to hide. */
  rapidEntry?: ItemListRapidEntryConfig;
  /** Render a single primary item */
  renderItem: (
    item: T,
    props: {
      isExpanded: boolean;
      onToggleExpand: (() => void) | undefined;
    },
  ) => ReactNode;
  /** Empty state message when no items and secondary section is empty/collapsed */
  emptyMessage: string;
  /** Secondary empty-state hint (e.g. "Capture a thought to get started") */
  emptyHint?: string;
  /** Footer count configuration */
  footer: ItemListFooterConfig;
  /** Collapsible secondary section (Done / Archived). Omit to hide. */
  secondarySection?: ItemListSecondarySectionConfig<T>;
  /** Slot between rapid entry and the item list (e.g. ContextFilterBar) */
  beforeItems?: ReactNode;
  /** Currently expanded item ID (controlled) */
  expandedId: CanonicalId | null;
  /** Called when expansion should change */
  onExpandedIdChange: (id: CanonicalId | null) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItemList<T extends BaseEntity>({
  items,
  header,
  rapidEntry,
  renderItem,
  emptyMessage,
  emptyHint,
  footer,
  secondarySection,
  beforeItems,
  expandedId,
  onExpandedIdChange,
  className,
}: ItemListProps<T>) {
  // Rapid entry state
  const [entryText, setEntryText] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Collapsible secondary section state
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);

  const handleAdd = useCallback(() => {
    if (!rapidEntry) return;
    const trimmed = entryText.trim();
    if (!trimmed) return;
    setCaptureError(null);
    setEntryText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    inputRef.current?.focus();

    if (rapidEntry.showCaptureErrors) {
      Promise.resolve(rapidEntry.onAdd(trimmed)).catch(() => {
        setCaptureError("Capture failed — please try again.");
      });
    } else {
      rapidEntry.onAdd(trimmed);
    }
  }, [entryText, rapidEntry]);

  const toggleExpand = useCallback(
    (id: CanonicalId) => {
      onExpandedIdChange(expandedId === id ? null : id);
    },
    [expandedId, onExpandedIdChange],
  );

  const hasSecondaryItems =
    secondarySection && secondarySection.items.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
          <Icon name={header.icon} size={22} />
          {header.label}
        </h1>
        <p className="text-xs text-text-muted">{header.subtitle}</p>
      </div>

      {/* Rapid Entry */}
      {rapidEntry && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-text-subtle">
              <Icon name="add" size={16} />
            </span>
            <AutoGrowTextarea
              ref={inputRef}
              value={entryText}
              onChange={(e) => {
                setEntryText(e.currentTarget.value);
                if (captureError) setCaptureError(null);
              }}
              submitOnEnter
              onSubmit={handleAdd}
              placeholder={rapidEntry.placeholder}
              aria-label={rapidEntry.ariaLabel}
              className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-subtle"
            />
          </div>
          {captureError && (
            <p role="alert" className="pl-6 text-xs text-status-error">
              {captureError}
            </p>
          )}
        </div>
      )}

      {/* Before-items slot (e.g. ContextFilterBar) */}
      {beforeItems}

      {/* Item rows */}
      {items.length === 0 && !hasSecondaryItems ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">{emptyMessage}</p>
          {emptyHint && (
            <p className="mt-1 text-xs text-text-subtle">{emptyHint}</p>
          )}
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <div className="space-y-0.5">
              {items.map((item) =>
                renderItem(item, {
                  isExpanded: expandedId === item.id,
                  onToggleExpand: () => toggleExpand(item.id),
                }),
              )}
            </div>
          )}
        </>
      )}

      {/* Collapsible secondary section (Done / Archived) */}
      {hasSecondaryItems && (
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setSecondaryExpanded((prev) => !prev)}
            aria-expanded={secondaryExpanded}
            aria-label={
              secondaryExpanded
                ? `Collapse ${secondarySection.label}`
                : `Expand ${secondarySection.label}`
            }
            className="flex items-center gap-1 py-1 text-xs text-text-subtle transition-colors hover:text-text"
          >
            <Icon
              name={
                secondarySection.isLoading
                  ? "progress_activity"
                  : secondaryExpanded
                    ? "expand_more"
                    : "chevron_right"
              }
              size={16}
            />
            <span>{secondarySection.label}</span>
          </button>

          {secondaryExpanded && (
            <div className={secondarySection.wrapperClassName}>
              {secondarySection.items.map((item) =>
                secondarySection.renderItem(item),
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer count */}
      {(items.length > 0 || hasSecondaryItems) && (
        <p className="text-center text-xs text-text-subtle">
          {footer.formatCount(items.length)}
        </p>
      )}
    </div>
  );
}
