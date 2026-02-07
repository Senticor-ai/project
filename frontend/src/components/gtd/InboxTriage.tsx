import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { ItemEditor } from "./ItemEditor";
import type {
  TriageBucket,
  TriageResult,
  Project,
  EnergyLevel,
  ItemEditableFields,
} from "@/model/gtd-types";
import type { CanonicalId } from "@/model/canonical-id";

export interface InboxTriageProps {
  onTriage: (result: TriageResult) => void;
  projects?: Pick<Project, "id" | "title">[];
  className?: string;
}

const bucketActions: Array<{
  bucket: TriageBucket;
  label: string;
  icon: string;
  colorClass: string;
}> = [
  { bucket: "next", label: "Next", icon: "bolt", colorClass: "text-gtd-next" },
  {
    bucket: "waiting",
    label: "Waiting",
    icon: "schedule",
    colorClass: "text-gtd-waiting",
  },
  {
    bucket: "calendar",
    label: "Calendar",
    icon: "calendar_month",
    colorClass: "text-gtd-calendar",
  },
  {
    bucket: "someday",
    label: "Someday",
    icon: "cloud",
    colorClass: "text-gtd-someday",
  },
  {
    bucket: "reference",
    label: "Reference",
    icon: "book",
    colorClass: "text-gtd-reference",
  },
];

export function InboxTriage({
  onTriage,
  projects = [],
  className,
}: InboxTriageProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedProject, setSelectedProject] = useState<
    CanonicalId | undefined
  >(undefined);
  const [date, setDate] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | undefined>(
    undefined,
  );

  const handleBucketClick = (bucket: TriageBucket) => {
    const result: TriageResult = { targetBucket: bucket };
    if (selectedProject) result.projectId = selectedProject;
    if (date) result.date = date;
    if (contexts.length > 0) result.contexts = contexts;
    if (energyLevel) result.energyLevel = energyLevel;
    onTriage(result);
  };

  const handleArchive = () => {
    onTriage({ targetBucket: "archive" });
  };

  const handleEditorChange = (fields: Partial<ItemEditableFields>) => {
    if ("projectId" in fields) setSelectedProject(fields.projectId);
    if ("scheduledDate" in fields) setDate(fields.scheduledDate ?? "");
    if ("contexts" in fields) setContexts(fields.contexts!);
    if ("energyLevel" in fields) setEnergyLevel(fields.energyLevel);
  };

  return (
    <div className={cn("mt-3 space-y-2", className)}>
      {/* Quick bucket actions */}
      <div className="flex flex-wrap gap-1.5">
        {bucketActions.map(({ bucket, label, icon, colorClass }) => (
          <button
            key={bucket}
            onClick={() => handleBucketClick(bucket)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[var(--radius-md)]",
              "border border-border px-2 py-1 text-xs font-medium",
              "transition-colors duration-[var(--duration-fast)]",
              "hover:bg-paper-100",
            )}
            aria-label={`Move to ${label}`}
          >
            <Icon name={icon} size={12} className={colorClass} />
            {label}
          </button>
        ))}
        <button
          onClick={handleArchive}
          className={cn(
            "inline-flex items-center gap-1 rounded-[var(--radius-md)]",
            "border border-border px-2 py-1 text-xs font-medium text-text-muted",
            "transition-colors duration-[var(--duration-fast)]",
            "hover:bg-paper-100",
          )}
          aria-label="Archive"
        >
          <Icon name="archive" size={12} />
          Archive
        </button>
      </div>

      {/* Expand toggle for optional details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-text-subtle hover:text-text-muted"
      >
        <Icon name={expanded ? "expand_less" : "expand_more"} size={12} />
        {expanded ? "Less options" : "More options"}
      </button>

      {/* Expandable details: project, date, labels */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ItemEditor
              values={{
                contexts,
                energyLevel,
                scheduledDate: date || undefined,
                projectId: selectedProject,
              }}
              onChange={handleEditorChange}
              projects={projects}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
