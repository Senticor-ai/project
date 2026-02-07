import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import type {
  ItemEditableFields,
  Project,
  EnergyLevel,
} from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ItemEditorProps {
  values: ItemEditableFields;
  onChange: (fields: Partial<ItemEditableFields>) => void;
  projects?: Pick<Project, "id" | "name">[];
  className?: string;
}

export function ItemEditor({
  values,
  onChange,
  projects = [],
  className,
}: ItemEditorProps) {
  const [contextInput, setContextInput] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const addContext = () => {
    const trimmed = contextInput.trim();
    if (trimmed && !values.contexts.includes(trimmed)) {
      onChange({ contexts: [...values.contexts, trimmed] });
      setContextInput("");
    }
  };

  const removeContext = (ctx: string) => {
    onChange({ contexts: values.contexts.filter((c) => c !== ctx) });
  };

  const toggleEnergy = (level: EnergyLevel) => {
    onChange({ energyLevel: values.energyLevel === level ? undefined : level });
  };

  return (
    <div
      className={cn(
        "space-y-3 rounded-[var(--radius-md)] border border-border bg-paper-50 p-3",
        className,
      )}
    >
      {/* Notes */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-xs text-text-muted">
          <Icon name="description" size={10} />
          Notes
        </label>
        <AutoGrowTextarea
          ref={notesRef}
          aria-label="Notes"
          submitOnEnter={false}
          defaultValue={values.description ?? ""}
          onBlur={(e) => {
            const val = e.currentTarget.value;
            if (val !== (values.description ?? "")) {
              onChange({ description: val || undefined });
            }
          }}
          placeholder="Add notes..."
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
        />
      </div>

      {/* Project assignment */}
      {projects.length > 0 && (
        <div>
          <label
            htmlFor="editor-project"
            className="mb-1 flex items-center gap-1 text-xs text-text-muted"
          >
            <Icon name="folder" size={10} />
            Assign to project
          </label>
          <select
            id="editor-project"
            aria-label="Assign to project"
            value={values.projectId ?? ""}
            onChange={(e) =>
              onChange({
                projectId: (e.target.value as CanonicalId) || undefined,
              })
            }
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Date */}
      <div>
        <label
          htmlFor="editor-date"
          className="mb-1 flex items-center gap-1 text-xs text-text-muted"
        >
          <Icon name="calendar_month" size={10} />
          Date
        </label>
        <input
          id="editor-date"
          aria-label="Date"
          type="date"
          value={values.scheduledDate ?? ""}
          onChange={(e) =>
            onChange({ scheduledDate: e.target.value || undefined })
          }
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
        />
      </div>

      {/* Complexity / energy */}
      <div>
        <label className="mb-1 flex items-center gap-1 text-xs text-text-muted">
          <Icon name="speed" size={10} />
          Complexity
        </label>
        <div className="flex gap-1">
          {(["low", "medium", "high"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleEnergy(level)}
              className={cn(
                "rounded-[var(--radius-sm)] border px-2 py-1 text-xs capitalize",
                values.energyLevel === level
                  ? "border-blueprint-400 bg-blueprint-50 font-medium text-blueprint-700"
                  : "border-border hover:bg-paper-100",
              )}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Context labels */}
      <div>
        <label className="mb-1 block text-xs text-text-muted">
          Labels / contexts
        </label>
        <div className="flex gap-1">
          <input
            type="text"
            value={contextInput}
            onChange={(e) => setContextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addContext();
              }
            }}
            placeholder="@phone, @office..."
            aria-label="Add label or context"
            className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
          />
          <button
            onClick={addContext}
            aria-label="Add"
            className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs hover:bg-paper-100"
          >
            Add
          </button>
        </div>
        {values.contexts.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {values.contexts.map((ctx) => (
              <span
                key={ctx}
                className="inline-flex items-center gap-1 rounded-full bg-blueprint-50 px-2 py-0.5 text-xs text-blueprint-700"
              >
                {ctx}
                <button
                  onClick={() => removeContext(ctx)}
                  className="text-blueprint-400 hover:text-blueprint-700"
                  aria-label={`Remove ${ctx}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
