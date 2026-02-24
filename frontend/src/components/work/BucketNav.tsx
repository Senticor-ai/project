import { useState, useMemo } from "react";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { navItems } from "./bucket-nav-items";
import type { Bucket, Project } from "@/model/types";

// Drop targets: buckets where items can be dragged to
const droppableBuckets = new Set<string>([
  "focus",
  "next",
  "waiting",
  "calendar",
  "someday",
  "reference",
]);

export interface BucketNavProps {
  activeBucket: Bucket;
  onSelect: (bucket: Bucket) => void;
  onSelectProject?: (projectId: Project["id"]) => void;
  counts?: Partial<Record<Bucket, number>>;
  projects?: Pick<Project, "id" | "name" | "isFocused" | "status">[];
  className?: string;
}

function BucketNavItem({
  bucket,
  label,
  icon,
  isActive,
  count,
  onSelect,
}: {
  bucket: Bucket;
  label: string;
  icon: string;
  isActive: boolean;
  count: number | undefined;
  onSelect: () => void;
}) {
  const isDropTarget = droppableBuckets.has(bucket);
  const { setNodeRef, isOver } = useDroppable({
    id: `bucket-${bucket}`,
    data: { bucket },
    disabled: !isDropTarget,
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      data-copilot-bucket-nav-item="true"
      data-copilot-bucket={bucket}
      data-copilot-bucket-count={count ?? 0}
      data-copilot-bucket-active={isActive ? "true" : "false"}
      className={cn(
        "flex w-full min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm",
        "transition-colors duration-[var(--duration-fast)]",
        isActive
          ? "bg-blueprint-50 font-medium text-blueprint-700"
          : "text-text-muted hover:bg-paper-100 hover:text-text",
        isOver && "ring-2 ring-blueprint-300 bg-blueprint-50/50",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon name={icon} size={16} className="shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {count != null && count > 0 && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            isActive
              ? "bg-blueprint-100 text-blueprint-700"
              : "bg-paper-200 text-text-subtle",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ProjectNavItem({
  project,
  onSelect,
}: {
  project: Pick<Project, "id" | "name">;
  onSelect?: (projectId: Project["id"]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `project-${project.id}`,
    data: { bucket: "next", projectId: project.id },
  });

  return (
    <button
      ref={setNodeRef}
      onClick={() => onSelect?.(project.id)}
      data-copilot-project-nav-item="true"
      data-copilot-project-id={project.id}
      data-copilot-project-name={project.name}
      className={cn(
        "flex w-full min-h-11 items-center gap-2 rounded-[var(--radius-md)] py-1.5 pl-8 pr-3 text-xs",
        "text-text-muted transition-colors duration-[var(--duration-fast)]",
        "hover:bg-paper-100 hover:text-text",
        isOver && "ring-2 ring-blueprint-300 bg-blueprint-50/50",
      )}
      aria-label={`Drop into ${project.name}`}
    >
      <Icon name="folder" size={14} className="shrink-0" />
      <span className="flex-1 truncate text-left">{project.name}</span>
    </button>
  );
}

export function BucketNav({
  activeBucket,
  onSelect,
  onSelectProject,
  counts = {},
  projects = [],
  className,
}: BucketNavProps) {
  const [dragExpandedProjects, setDragExpandedProjects] = useState(false);

  // Monitor drag events to expand/collapse project list
  useDndMonitor({
    onDragStart() {
      // Auto-expand all active projects as drop targets when any drag begins
      if (activeProjects.length > 0) {
        setDragExpandedProjects(true);
      }
    },
    onDragOver(event) {
      const overId = event.over?.id;
      if (overId === "bucket-project") {
        setDragExpandedProjects(true);
      }
    },
    onDragEnd() {
      setDragExpandedProjects(false);
    },
    onDragCancel() {
      setDragExpandedProjects(false);
    },
  });

  const starredProjects = useMemo(
    () => projects.filter((p) => p.isFocused && p.status === "active"),
    [projects],
  );

  const activeProjects = projects.filter((p) => p.status === "active");

  // When drag-expanded, show all active projects; otherwise show only starred
  const visibleProjects = dragExpandedProjects
    ? activeProjects
    : starredProjects;

  return (
    <nav className={cn("space-y-0.5", className)} aria-label="Buckets">
      {navItems.map(({ bucket, label, icon }) => (
        <div key={bucket}>
          <BucketNavItem
            bucket={bucket}
            label={label}
            icon={icon}
            isActive={activeBucket === bucket}
            count={counts[bucket]}
            onSelect={() => onSelect(bucket)}
          />
          {/* Project sub-items: starred or drag-expanded */}
          {bucket === "project" && visibleProjects.length > 0 && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                {visibleProjects.map((p) => (
                  <ProjectNavItem
                    key={p.id}
                    project={p}
                    onSelect={(projectId) => {
                      if (onSelectProject) {
                        onSelectProject(projectId);
                        return;
                      }
                      onSelect("project");
                    }}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      ))}
    </nav>
  );
}
