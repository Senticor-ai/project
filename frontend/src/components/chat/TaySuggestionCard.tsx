import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { TaySuggestion, SuggestionStatus } from "@/model/chat-types";

// ---------------------------------------------------------------------------
// Bucket display labels
// ---------------------------------------------------------------------------

const bucketLabels: Record<string, string> = {
  inbox: "Inbox",
  next: "Next",
  waiting: "Waiting",
  calendar: "Calendar",
  someday: "Someday",
};

// ---------------------------------------------------------------------------
// TaySuggestionCard
// ---------------------------------------------------------------------------

export interface TaySuggestionCardProps {
  suggestion: TaySuggestion;
  status: SuggestionStatus;
  onAccept: () => void;
  onDismiss: () => void;
  className?: string;
}

export function TaySuggestionCard({
  suggestion,
  status,
  onAccept,
  onDismiss,
  className,
}: TaySuggestionCardProps) {
  if (status === "dismissed") {
    return (
      <div className={cn("flex items-start gap-2", className)}>
        <div className="ml-9 text-xs text-text-muted italic">
          Vorschlag verworfen
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <div
        className={cn(
          "ml-9 max-w-[85%] rounded-xl border border-dashed px-4 py-3",
          status === "accepted"
            ? "border-green-300 bg-green-50/50"
            : "border-paper-300 bg-paper-50",
        )}
      >
        {suggestion.type === "create_project_with_actions" && (
          <ProjectSuggestionContent suggestion={suggestion} />
        )}
        {suggestion.type === "create_action" && (
          <ActionSuggestionContent suggestion={suggestion} />
        )}
        {suggestion.type === "create_reference" && (
          <ReferenceSuggestionContent suggestion={suggestion} />
        )}
        {suggestion.type === "render_cv" && (
          <RenderCvSuggestionContent suggestion={suggestion} />
        )}

        {/* Action bar */}
        {status === "pending" && (
          <div className="mt-3 flex items-center gap-2 border-t border-paper-200 pt-3">
            <button
              onClick={onAccept}
              className="inline-flex items-center gap-1 rounded-lg bg-blueprint-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blueprint-600"
            >
              <Icon name="check" size={14} />
              Übernehmen
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-paper-100"
            >
              <Icon name="close" size={14} />
              Verwerfen
            </button>
          </div>
        )}

        {status === "accepted" && (
          <div className="mt-3 flex items-center gap-1 border-t border-green-200 pt-3 text-xs font-medium text-green-700">
            <Icon name="check_circle" size={14} />
            Übernommen
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content renderers per suggestion type
// ---------------------------------------------------------------------------

function ProjectSuggestionContent({
  suggestion,
}: {
  suggestion: Extract<TaySuggestion, { type: "create_project_with_actions" }>;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Icon name="folder" size={16} className="text-blueprint-500" />
        <span className="text-sm font-medium">{suggestion.project.name}</span>
      </div>
      <p className="mt-0.5 ml-5.5 text-xs text-text-muted">
        {suggestion.project.desiredOutcome}
      </p>

      {suggestion.actions.length > 0 && (
        <ul className="mt-2 ml-5.5 space-y-1">
          {suggestion.actions.map((action, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block h-3.5 w-3.5 rounded border border-paper-300" />
              <span>{action.name}</span>
            </li>
          ))}
        </ul>
      )}

      {suggestion.documents && suggestion.documents.length > 0 && (
        <div className="mt-2 ml-5.5 space-y-1">
          {suggestion.documents.map((doc, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <Icon name="description" size={14} className="text-paper-500" />
              <span>{doc.name}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ActionSuggestionContent({
  suggestion,
}: {
  suggestion: Extract<TaySuggestion, { type: "create_action" }>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon name="task_alt" size={16} className="text-blueprint-500" />
      <span className="text-sm font-medium">{suggestion.name}</span>
      <span className="ml-auto rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-medium text-text-muted">
        {bucketLabels[suggestion.bucket] ?? suggestion.bucket}
      </span>
    </div>
  );
}

function ReferenceSuggestionContent({
  suggestion,
}: {
  suggestion: Extract<TaySuggestion, { type: "create_reference" }>;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Icon name="description" size={16} className="text-blueprint-500" />
        <span className="text-sm font-medium">{suggestion.name}</span>
      </div>
      {suggestion.description && (
        <p className="mt-0.5 ml-5.5 text-xs text-text-muted">
          {suggestion.description}
        </p>
      )}
    </>
  );
}

function RenderCvSuggestionContent({
  suggestion,
}: {
  suggestion: Extract<TaySuggestion, { type: "render_cv" }>;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Icon name="picture_as_pdf" size={16} className="text-red-500" />
        <span className="text-sm font-medium">{suggestion.filename}</span>
      </div>
      <p className="mt-1 ml-5.5 text-xs text-text-muted">
        Aus Markdown-Referenz rendern
      </p>
    </>
  );
}
