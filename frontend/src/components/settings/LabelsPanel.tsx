import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface LabelsPanelProps {
  contexts: string[];
  tags: string[];
  onAddContext: (name: string) => void;
  onRemoveContext: (name: string) => void;
  onAddTag: (name: string) => void;
  onRemoveTag: (name: string) => void;
  className?: string;
}

function ChipList({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (item: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full bg-blueprint-50 px-2 py-0.5 text-xs text-blueprint-700"
        >
          {item}
          <button
            onClick={() => onRemove(item)}
            className="text-blueprint-400 hover:text-blueprint-700"
            aria-label={`Remove ${item}`}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}

function AddInput({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed) {
      onAdd(trimmed);
      setInput("");
    }
  };

  return (
    <div className="flex gap-1">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        placeholder={placeholder}
        className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-xs"
      />
      <button
        onClick={handleAdd}
        className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs hover:bg-paper-100"
      >
        Add
      </button>
    </div>
  );
}

export function LabelsPanel({
  contexts,
  tags,
  onAddContext,
  onRemoveContext,
  onAddTag,
  onRemoveTag,
  className,
}: LabelsPanelProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Context Labels */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="label" size={14} />
            Context Labels
          </span>
        </h3>
        <p className="text-xs text-text-subtle">
          Contexts represent where or how you can do work (@phone, @computer,
          @office)
        </p>
        <AddInput placeholder="@phone, @office..." onAdd={onAddContext} />
        <ChipList items={contexts} onRemove={onRemoveContext} />
      </section>

      {/* Energy Levels */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="speed" size={14} />
            Energy Levels
          </span>
        </h3>
        <p className="text-xs text-text-subtle">
          System-defined energy levels for actions
        </p>
        <div className="flex gap-1">
          {(["low", "medium", "high"] as const).map((level) => (
            <span
              key={level}
              className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs capitalize text-text-muted"
            >
              {level}
            </span>
          ))}
        </div>
      </section>

      {/* Custom Tags */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          <span className="flex items-center gap-1">
            <Icon name="sell" size={14} />
            Custom Tags
          </span>
        </h3>
        <p className="text-xs text-text-subtle">
          Tags for additional categorization beyond GTD contexts
        </p>
        <AddInput placeholder="New tag..." onAdd={onAddTag} />
        <ChipList items={tags} onRemove={onRemoveTag} />
      </section>
    </div>
  );
}
