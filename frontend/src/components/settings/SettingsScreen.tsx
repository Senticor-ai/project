import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { ImportExportPanel } from "./ImportExportPanel";
import { LabelsPanel } from "./LabelsPanel";
import { PreferencesPanel } from "./PreferencesPanel";
import { DEFAULT_PREFERENCES, type ExportFormat } from "@/model/settings-types";
import type { ImportJobData } from "./ImportJobRow";

export type SettingsTab = "import-export" | "labels" | "preferences";

const settingsTabs: TabItem[] = [
  { id: "import-export", label: "Import / Export", icon: "swap_horiz" },
  { id: "labels", label: "Labels & Contexts", icon: "label" },
  { id: "preferences", label: "Preferences", icon: "tune" },
];

export interface SettingsScreenProps {
  /** Controlled active tab — when provided, component is fully controlled. */
  activeTab?: SettingsTab;
  /** Called when user clicks a tab. Required when using controlled mode. */
  onTabChange?: (tab: SettingsTab) => void;
  /** @deprecated Use activeTab instead. Only used in uncontrolled mode. */
  initialTab?: SettingsTab;
  onImportNirvana?: () => void;
  onExport?: (format: ExportFormat) => void;
  importJobs?: ImportJobData[];
  className?: string;
}

export function SettingsScreen({
  activeTab: controlledTab,
  onTabChange,
  initialTab = "import-export",
  onImportNirvana,
  onExport,
  importJobs,
  className,
}: SettingsScreenProps) {
  const [internalTab, setInternalTab] = useState<SettingsTab>(initialTab);
  const activeTab = controlledTab ?? internalTab;
  const handleTabChange = (tab: SettingsTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };
  const [contexts, setContexts] = useState<string[]>([
    "@Buero",
    "@Telefon",
    "@Computer",
    "@Zuhause",
    "@Unterwegs",
  ]);
  const [tags, setTags] = useState<string[]>([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  return (
    <div className={cn("flex gap-6", className)}>
      <Tabs
        tabs={settingsTabs}
        activeTab={activeTab}
        onSelect={(id) => handleTabChange(id as SettingsTab)}
        className="w-56 shrink-0"
      />

      <main className="min-w-0 flex-1" aria-label="Settings content">
        <div id={`tabpanel-${activeTab}`} role="tabpanel">
          {activeTab === "import-export" && (
            <ImportExportPanel
              onImportNirvana={onImportNirvana ?? (() => {})}
              onExport={onExport ?? (() => {})}
              importJobs={importJobs}
            />
          )}
          {activeTab === "labels" && (
            <LabelsPanel
              contexts={contexts}
              tags={tags}
              onAddContext={(name) => {
                if (!contexts.includes(name))
                  setContexts((prev) => [...prev, name]);
              }}
              onRemoveContext={(name) =>
                setContexts((prev) => prev.filter((c) => c !== name))
              }
              onAddTag={(name) => {
                if (!tags.includes(name)) setTags((prev) => [...prev, name]);
              }}
              onRemoveTag={(name) =>
                setTags((prev) => prev.filter((t) => t !== name))
              }
            />
          )}
          {activeTab === "preferences" && (
            <PreferencesPanel
              preferences={preferences}
              onChange={(update) =>
                setPreferences((prev) => ({ ...prev, ...update }))
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
