import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { CopilotSuggestion, SuggestionStatus } from "@/model/chat-types";

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

interface CopilotCliSummary {
  title: string;
  details: string[];
}

function optionValue(argv: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (typeof token !== "string") {
      continue;
    }
    for (const name of names) {
      if (token === name) {
        return argv[i + 1];
      }
      if (token.startsWith(`${name}=`)) {
        return token.slice(name.length + 1);
      }
    }
  }
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.some((token) => token === name);
}

function compactId(value: string): string {
  if (!value) {
    return value;
  }
  if (value.startsWith("urn:")) {
    const last = value.split(":").at(-1);
    return last && last.length > 0 ? last : value;
  }
  return value;
}

function humanizeKind(kind: string): string {
  if (!kind) {
    return kind;
  }
  return kind.replaceAll("_", " ");
}

function summarizeCopilotCli(
  suggestion: Extract<CopilotSuggestion, { type: "copilot_cli" }>,
): CopilotCliSummary {
  if (!Array.isArray(suggestion.argv) || suggestion.argv.length === 0) {
    const intent = suggestion.intent;
    const kind =
      intent && typeof intent === "object" && typeof intent.kind === "string"
        ? intent.kind
        : undefined;

    return {
      title: "Copilot-Intent ausführen",
      details: kind ? [`Intent: ${humanizeKind(kind)}`] : [],
    };
  }

  const argv = suggestion.argv;
  const first = argv[0];
  const second = argv[1];
  const third = argv[2];
  const fourth = argv[3];

  if (first === "items" && second === "focus") {
    const itemId = argv[2];
    return {
      title: hasFlag(argv, "--off")
        ? "Fokus bei einem Element entfernen"
        : "Fokus auf ein Element setzen",
      details: itemId ? [`Element: ${compactId(itemId)}`] : [],
    };
  }

  if (first === "items" && second === "triage") {
    const bucket = optionValue(argv, "--bucket");
    const status = optionValue(argv, "--status");
    const details: string[] = [];
    if (bucket) {
      details.push(`Bucket: ${bucketLabels[bucket] ?? bucket}`);
    }
    if (status) {
      details.push(`Status: ${status}`);
    }
    return {
      title:
        bucket === "completed"
          ? "Element als erledigt markieren"
          : "Element umsortieren",
      details,
    };
  }

  if (first === "items" && second === "create") {
    const itemType = optionValue(argv, "--type");
    const name = optionValue(argv, "--name");
    const bucket = optionValue(argv, "--bucket");
    const title =
      itemType === "Project"
        ? "Projekt erstellen"
        : itemType === "CreativeWork" || itemType === "DigitalDocument"
          ? "Referenz erstellen"
          : "Aktion erstellen";
    const details: string[] = [];
    if (name) {
      details.push(`Titel: ${name}`);
    }
    if (bucket) {
      details.push(`Bucket: ${bucketLabels[bucket] ?? bucket}`);
    }
    return { title, details };
  }

  if (first === "projects" && second === "create") {
    const name = optionValue(argv, "--name");
    const desiredOutcome = optionValue(argv, "--desired-outcome");
    const details: string[] = [];
    if (name) {
      details.push(`Titel: ${name}`);
    }
    if (desiredOutcome) {
      details.push(`Ergebnis: ${desiredOutcome}`);
    }
    return { title: "Projekt erstellen", details };
  }

  if (first === "projects" && second === "actions" && third === "create") {
    const name = optionValue(argv, "--name");
    const details: string[] = [];
    if (name) {
      details.push(`Titel: ${name}`);
    }
    return { title: "Projektaktion erstellen", details };
  }

  if (first === "projects" && second === "actions" && third === "update") {
    const positionals = argv.slice(3).filter((token) => !token.startsWith("-"));
    const actionId = optionValue(argv, "--action") ?? positionals.at(-1);
    const projectId = optionValue(argv, "--project", "--project-id");
    const name = optionValue(argv, "--name");
    const due = optionValue(argv, "--due");
    const assignee =
      optionValue(argv, "--assignee-text") ??
      optionValue(argv, "--assignee-user");
    const details: string[] = [];
    if (name) {
      details.push(`Neuer Titel: ${name}`);
    }
    if (due) {
      details.push(`Fällig: ${due}`);
    }
    if (assignee) {
      details.push(`Verantwortlich: ${assignee}`);
    }
    if (actionId) {
      details.push(`Aktion: ${compactId(actionId)}`);
    }
    if (projectId) {
      details.push(`Projekt: ${compactId(projectId)}`);
    }
    return { title: "Projektaktion aktualisieren", details };
  }

  if (first === "projects" && second === "actions" && third === "transition") {
    const status = optionValue(argv, "--status");
    return {
      title: "Status einer Projektaktion ändern",
      details: status ? [`Neuer Status: ${status}`] : [],
    };
  }

  if (
    first === "projects" &&
    second === "actions" &&
    third === "comments" &&
    fourth === "add"
  ) {
    return {
      title: "Kommentar zu einer Projektaktion hinzufügen",
      details: [],
    };
  }

  if (
    first === "projects" &&
    second === "actions" &&
    third === "comments" &&
    fourth === "reply"
  ) {
    return { title: "Antwort auf einen Kommentar hinzufügen", details: [] };
  }

  if (first === "proposals" && second === "apply") {
    return { title: "Vorschläge übernehmen", details: [] };
  }

  if (first === "orgs" && second === "docs" && third === "update") {
    const orgId = argv[3];
    const docType = optionValue(argv, "--doc");
    const details: string[] = [];
    if (orgId) {
      details.push(`Organisation: ${orgId}`);
    }
    if (docType) {
      details.push(`Dokument: ${docType.toUpperCase()}.md`);
    }
    return { title: "Org-Dokument aktualisieren", details };
  }

  if (first === "orgs" && second === "docs" && third === "append") {
    const orgId = argv[3];
    const text = optionValue(argv, "--text");
    const details: string[] = [];
    if (orgId) {
      details.push(`Organisation: ${orgId}`);
    }
    if (text) {
      details.push(
        `Eintrag: ${text.length > 80 ? text.slice(0, 80) + "…" : text}`,
      );
    }
    return { title: "Org-Protokoll ergänzen", details };
  }

  return {
    title: "Änderung über Senticor Copilot CLI anwenden",
    details: [],
  };
}

function technicalDetailsPreview(
  suggestion: Extract<CopilotSuggestion, { type: "copilot_cli" }>,
): string {
  if (Array.isArray(suggestion.argv) && suggestion.argv.length > 0) {
    return suggestion.argv.join(" ");
  }
  const intent = suggestion.intent;
  if (!intent || typeof intent !== "object") {
    return "(kein CLI-Detail angegeben)";
  }
  return JSON.stringify(intent, null, 2);
}

// ---------------------------------------------------------------------------
// CopilotSuggestionCard
// ---------------------------------------------------------------------------

export interface CopilotSuggestionCardProps {
  suggestion: CopilotSuggestion;
  status: SuggestionStatus;
  onAccept: () => void;
  onDismiss: () => void;
  className?: string;
}

export function CopilotSuggestionCard({
  suggestion,
  status,
  onAccept,
  onDismiss,
  className,
}: CopilotSuggestionCardProps) {
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
        {suggestion.type === "copilot_cli" && (
          <CopilotCliSuggestionContent suggestion={suggestion} />
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
  suggestion: Extract<
    CopilotSuggestion,
    { type: "create_project_with_actions" }
  >;
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
  suggestion: Extract<CopilotSuggestion, { type: "create_action" }>;
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
  suggestion: Extract<CopilotSuggestion, { type: "create_reference" }>;
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
  suggestion: Extract<CopilotSuggestion, { type: "render_cv" }>;
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

function CopilotCliSuggestionContent({
  suggestion,
}: {
  suggestion: Extract<CopilotSuggestion, { type: "copilot_cli" }>;
}) {
  const summary = summarizeCopilotCli(suggestion);
  const commandPreview = technicalDetailsPreview(suggestion);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Icon name="terminal" size={16} className="text-blueprint-500" />
        <span className="text-sm font-medium">Senticor Copilot CLI</span>
      </div>
      <p className="mt-1 ml-5.5 text-xs text-text">{summary.title}</p>
      {summary.details.length > 0 && (
        <ul className="mt-1 ml-9 space-y-1 text-xs text-text-muted">
          {summary.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      <details className="mt-2 ml-5.5">
        <summary className="cursor-pointer text-xs text-text-muted">
          Technische Details
        </summary>
        <code className="mt-1 block rounded bg-paper-100 px-2 py-1 text-xs text-text whitespace-pre-wrap break-all">
          {commandPreview}
        </code>
      </details>
    </>
  );
}
