import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { getMessage } from "@/lib/messages";
import { ItemsApi } from "@/lib/api-client";
import { usePatchFileContent, useAppendContent } from "@/hooks/use-mutations";
import type { OrgDocItem, OrgDocType } from "@/model/types";

export interface OrgDocEditorProps {
  item: OrgDocItem;
  className?: string;
}

const DOC_TYPE_ICONS: Record<OrgDocType, string> = {
  general: "description",
  user: "person",
  log: "history",
  agent: "smart_toy",
};

export function OrgDocTypeIcon({ docType }: { docType: OrgDocType }) {
  return (
    <Icon
      name={DOC_TYPE_ICONS[docType]}
      className="shrink-0 text-[16px] text-ink-400"
    />
  );
}

export function OrgDocEditor({ item, className }: OrgDocEditorProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["item-content", item.id],
    queryFn: () => ItemsApi.getContent(item.id),
  });

  const patchMutation = usePatchFileContent();
  const appendMutation = useAppendContent();

  const [editText, setEditText] = useState<string | undefined>(undefined);
  const [appendText, setAppendText] = useState("");

  const handleBlur = () => {
    if (editText === undefined) return;
    const current = data?.file_content ?? "";
    if (editText !== current) {
      patchMutation.mutate({ itemId: item.id, text: editText });
    }
  };

  const handleAppend = () => {
    const trimmed = appendText.trim();
    if (!trimmed) return;
    appendMutation.mutate({ itemId: item.id, text: trimmed });
    setAppendText("");
  };

  if (isLoading) {
    return (
      <div className={cn("py-4 text-center text-xs text-ink-300", className)}>
        Loading…
      </div>
    );
  }

  const content = data?.file_content ?? "";

  // GENERAL / USER — editable textarea
  if (item.orgDocType === "general" || item.orgDocType === "user") {
    return (
      <div className={cn("space-y-1", className)}>
        <textarea
          value={editText !== undefined ? editText : content}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleBlur}
          rows={12}
          aria-label={`Edit ${item.name}`}
          className={cn(
            "w-full resize-y rounded-[var(--radius-md)] border border-paper-200",
            "bg-transparent px-2 py-1.5 font-mono text-xs text-ink-700",
            "outline-none placeholder:text-ink-300 focus:border-blueprint-400",
          )}
          placeholder={`# ${item.name}\n\n…`}
        />
        {patchMutation.isPending && (
          <p className="text-[11px] text-ink-300">
            {getMessage("orgDoc.editor.saveLabel")}…
          </p>
        )}
      </div>
    );
  }

  // LOG — read-only + append input
  if (item.orgDocType === "log") {
    return (
      <div className={cn("space-y-2", className)}>
        {content ? (
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-paper-100 p-2 font-mono text-xs text-ink-600">
            {content}
          </pre>
        ) : (
          <p className="text-xs text-ink-300">No log entries yet.</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={appendText}
            onChange={(e) => setAppendText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAppend()}
            placeholder={getMessage("orgDoc.editor.appendPlaceholder")}
            className={cn(
              "min-w-0 flex-1 rounded-[var(--radius-md)] border border-paper-200",
              "bg-transparent px-2 py-1 text-xs text-ink-700",
              "outline-none placeholder:text-ink-300 focus:border-blueprint-400",
            )}
          />
          <button
            onClick={handleAppend}
            disabled={!appendText.trim() || appendMutation.isPending}
            className={cn(
              "shrink-0 rounded-[var(--radius-md)] bg-blueprint-600 px-3 py-1 text-xs text-white",
              "hover:bg-blueprint-700 disabled:opacity-40",
            )}
          >
            {getMessage("orgDoc.editor.appendLabel")}
          </button>
        </div>
      </div>
    );
  }

  // AGENT — read-only
  return (
    <div className={cn("space-y-1", className)}>
      {content ? (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-paper-100 p-2 font-mono text-xs text-ink-600">
          {content}
        </pre>
      ) : (
        <p className="text-xs text-ink-300">
          Agent has not written any notes yet.
        </p>
      )}
      {data?.file_content && (
        <p className="text-[11px] text-ink-300">
          Last updated: {item.provenance.updatedAt.slice(0, 10)}
        </p>
      )}
    </div>
  );
}
