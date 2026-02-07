import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ThingRow } from "./ThingRow";
import {
  getProjectActions,
  getNextActionId,
  isProjectStalled,
} from "@/lib/project-utils";
import type { Thing, Project } from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

export interface ProjectTreeProps {
  projects: Project[];
  actions: Thing[];
  onCompleteAction: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onAddAction: (projectId: CanonicalId, title: string) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  className?: string;
}

export function ProjectTree({
  projects,
  actions,
  onCompleteAction,
  onToggleFocus,
  onAddAction,
  onUpdateTitle,
  className,
}: ProjectTreeProps) {
  const [expandedId, setExpandedId] = useState<CanonicalId | null>(null);

  const [showAll, setShowAll] = useState(false);

  const activeProjects = projects.filter((p) => p.status === "active");
  const nonActiveProjects = projects.filter((p) => p.status !== "active");

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
            <Icon name="folder" size={22} />
            Projects
          </h1>
          <p className="text-xs text-text-muted">Multi-step outcomes</p>
        </div>
        {nonActiveProjects.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            aria-label={showAll ? "Show active only" : "Show all projects"}
            aria-pressed={showAll}
            className={cn(
              "rounded-[var(--radius-md)] p-1.5 transition-colors duration-[var(--duration-fast)]",
              showAll
                ? "bg-blueprint-50 text-blueprint-500"
                : "text-text-subtle hover:bg-paper-100 hover:text-text",
            )}
          >
            <Icon name={showAll ? "visibility" : "visibility_off"} size={16} />
          </button>
        )}
      </div>

      {/* Project rows */}
      {activeProjects.length === 0 &&
      !(showAll && nonActiveProjects.length > 0) ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">No active projects</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              actions={getProjectActions(project, actions)}
              allActions={actions}
              isExpanded={expandedId === project.id}
              onToggleExpand={() =>
                setExpandedId((prev) =>
                  prev === project.id ? null : project.id,
                )
              }
              onCompleteAction={onCompleteAction}
              onToggleFocus={onToggleFocus}
              onAddAction={(title) => onAddAction(project.id, title)}
              onUpdateTitle={onUpdateTitle}
            />
          ))}
        </div>
      )}

      {/* Non-active projects section */}
      {showAll && nonActiveProjects.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-subtle">
              {nonActiveProjects.length} inactive
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {nonActiveProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              actions={getProjectActions(project, actions)}
              allActions={actions}
              isExpanded={expandedId === project.id}
              onToggleExpand={() =>
                setExpandedId((prev) =>
                  prev === project.id ? null : project.id,
                )
              }
              onCompleteAction={onCompleteAction}
              onToggleFocus={onToggleFocus}
              onAddAction={(title) => onAddAction(project.id, title)}
              onUpdateTitle={onUpdateTitle}
              statusBadge
            />
          ))}
        </div>
      )}

      {/* Footer count */}
      {(activeProjects.length > 0 ||
        (showAll && nonActiveProjects.length > 0)) && (
        <p className="text-center text-xs text-text-subtle">
          {activeProjects.length} project
          {activeProjects.length !== 1 && "s"}
          {showAll && nonActiveProjects.length > 0 && (
            <span> (+{nonActiveProjects.length} inactive)</span>
          )}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectRow (internal)
// ---------------------------------------------------------------------------

interface ProjectRowProps {
  project: Project;
  actions: Thing[];
  allActions: Thing[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCompleteAction: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onAddAction: (title: string) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
  statusBadge?: boolean;
}

function ProjectRow({
  project,
  actions,
  allActions,
  isExpanded,
  onToggleExpand,
  onCompleteAction,
  onToggleFocus,
  onAddAction,
  onUpdateTitle,
  statusBadge,
}: ProjectRowProps) {
  const stalled = isProjectStalled(project, allActions);

  return (
    <div data-project-id={project.id} className="rounded-lg">
      {/* Project header */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.title}`}
        className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-paper-100"
      >
        <span className="shrink-0 text-text-subtle">
          <Icon
            name="chevron_right"
            size={18}
            className={cn(
              "transition-transform duration-150",
              isExpanded && "rotate-90",
            )}
          />
        </span>
        <Icon name="folder" size={18} className="shrink-0 text-blueprint-500" />
        <span className="flex-1 whitespace-pre-wrap text-sm font-medium text-text">
          {project.title}
        </span>

        {/* Action count badge */}
        <span className="shrink-0 rounded-full bg-paper-100 px-1.5 text-xs text-text-muted">
          {actions.length}
        </span>

        {/* Status badge (non-active projects) */}
        {statusBadge && project.status !== "active" && (
          <span className="shrink-0 rounded-full bg-paper-200 px-1.5 text-[10px] capitalize text-text-muted">
            {project.status}
          </span>
        )}

        {/* Stalled indicator */}
        {stalled && (
          <span
            aria-label="Needs next action"
            className="shrink-0 text-amber-700"
          >
            <Icon name="warning" size={16} />
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 pb-2 pt-1">
          {/* Desired outcome */}
          {project.desiredOutcome && (
            <p className="mb-2 text-xs text-text-muted italic">
              {project.desiredOutcome}
            </p>
          )}

          {/* Sequential action list */}
          <ProjectActionList
            actions={actions}
            onComplete={onCompleteAction}
            onToggleFocus={onToggleFocus}
            onAdd={onAddAction}
            onUpdateTitle={onUpdateTitle}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectActionList (internal)
// ---------------------------------------------------------------------------

interface ProjectActionListProps {
  actions: Thing[];
  onComplete: (id: CanonicalId) => void;
  onToggleFocus: (id: CanonicalId) => void;
  onAdd: (title: string) => void;
  onUpdateTitle?: (id: CanonicalId, newTitle: string) => void;
}

const noopMove = () => {};

function ProjectActionList({
  actions,
  onComplete,
  onToggleFocus,
  onAdd,
  onUpdateTitle,
}: ProjectActionListProps) {
  const [entryText, setEntryText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = getNextActionId(actions);

  const handleAdd = useCallback(() => {
    const trimmed = entryText.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setEntryText("");
    inputRef.current?.focus();
  }, [entryText, onAdd]);

  return (
    <div className="space-y-1">
      {actions.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-muted">
          No actions yet
        </p>
      ) : (
        actions.map((action) => {
          const isNext = action.id === nextId;

          return (
            <div
              key={action.id}
              data-action-id={action.id}
              className={cn(isNext && "ring-2 ring-blueprint-300 rounded-[var(--radius-md)]")}
            >
              <ThingRow
                thing={action}
                onComplete={onComplete}
                onToggleFocus={onToggleFocus}
                onMove={noopMove}
                onArchive={noopMove}
                onUpdateTitle={onUpdateTitle}
                showBucket={false}
              />
            </div>
          );
        })
      )}

      {/* Rapid entry for adding actions to project */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-text-subtle">
          <Icon name="add" size={14} />
        </span>
        <AutoGrowTextarea
          ref={inputRef}
          value={entryText}
          onChange={(e) => setEntryText(e.currentTarget.value)}
          submitOnEnter
          onSubmit={handleAdd}
          placeholder="Add action to project..."
          aria-label="Add action to project"
          className="flex-1 bg-transparent text-xs text-text outline-none placeholder:text-text-subtle"
        />
      </div>
    </div>
  );
}
