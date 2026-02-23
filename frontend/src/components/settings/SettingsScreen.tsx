import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { AgentSetupPanel } from "./AgentSetupPanel";
import { DeveloperPanel } from "./DeveloperPanel";
import { EmailPanel } from "./EmailPanel";
import { ImportExportPanel } from "./ImportExportPanel";
import { LabelsPanel } from "./LabelsPanel";
import { OrganizationsPanel } from "./OrganizationsPanel";
import { PreferencesPanel } from "./PreferencesPanel";
import {
  DEFAULT_PREFERENCES,
  type ExportOptions,
} from "@/model/settings-types";
import type { EmailConnectionResponse, OrgResponse } from "@/lib/api-client";
import type { ImportJobData } from "./ImportJobRow";
import type { AgentSettings } from "./AgentSetupPanel";

export type SettingsTab =
  | "import-export"
  | "email"
  | "labels"
  | "organizations"
  | "preferences"
  | "agent-setup"
  | "developer";

const settingsTabs: TabItem[] = [
  { id: "import-export", label: "Import / Export", icon: "swap_horiz" },
  { id: "email", label: "Email", icon: "mail" },
  { id: "labels", label: "Labels & Contexts", icon: "label" },
  { id: "organizations", label: "Organizations", icon: "apartment" },
  { id: "preferences", label: "Preferences", icon: "tune" },
  { id: "agent-setup", label: "Agent Setup", icon: "smart_toy" },
  { id: "developer", label: "Developer", icon: "code" },
];

export interface SettingsScreenProps {
  /** Controlled active tab — when provided, component is fully controlled. */
  activeTab?: SettingsTab;
  /** Called when user clicks a tab. Required when using controlled mode. */
  onTabChange?: (tab: SettingsTab) => void;
  /** @deprecated Use activeTab instead. Only used in uncontrolled mode. */
  initialTab?: SettingsTab;
  onImportNative?: () => void;
  onImportNirvana?: () => void;
  onExport?: (options: ExportOptions) => void;
  onFlush?: () => Promise<import("@/lib/api-client").FlushResponse>;
  importJobs?: ImportJobData[];
  onRetryJob?: (jobId: string) => void;
  onArchiveJob?: (jobId: string) => void;
  retryingJobId?: string | null;
  emailConnections?: EmailConnectionResponse[];
  emailLoading?: boolean;
  onConnectGmail?: () => void;
  onEmailSync?: (connectionId: string) => void;
  onEmailDisconnect?: (connectionId: string) => void;
  onEmailUpdateSyncInterval?: (connectionId: string, minutes: number) => void;
  onEmailUpdateMarkRead?: (connectionId: string, markRead: boolean) => void;
  emailSyncingConnectionId?: string | null;
  organizations?: OrgResponse[];
  organizationsLoading?: boolean;
  onCreateOrg?: (name: string) => void;
  isCreatingOrg?: boolean;
  agentSettings?: AgentSettings;
  onAgentUpdate?: (
    update: Parameters<
      import("./AgentSetupPanel").AgentSetupPanelProps["onUpdate"]
    >[0],
  ) => void;
  onAgentDeleteApiKey?: () => void;
  onAgentStopContainer?: () => void;
  onAgentRestartContainer?: () => void;
  agentSaving?: boolean;
  isContainerActionPending?: boolean;
  canInstall?: boolean;
  onInstall?: () => void;
  className?: string;
}

export function SettingsScreen({
  activeTab: controlledTab,
  onTabChange,
  initialTab = "import-export",
  onImportNative,
  onImportNirvana,
  onExport,
  onFlush,
  importJobs,
  onRetryJob,
  onArchiveJob,
  retryingJobId,
  emailConnections,
  emailLoading,
  onConnectGmail,
  onEmailSync,
  onEmailDisconnect,
  onEmailUpdateSyncInterval,
  onEmailUpdateMarkRead,
  emailSyncingConnectionId,
  organizations,
  organizationsLoading,
  onCreateOrg,
  isCreatingOrg,
  agentSettings,
  onAgentUpdate,
  onAgentDeleteApiKey,
  onAgentStopContainer,
  onAgentRestartContainer,
  agentSaving,
  isContainerActionPending,
  canInstall,
  onInstall,
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
              onImportNative={onImportNative ?? (() => {})}
              onImportNirvana={onImportNirvana ?? (() => {})}
              onExport={onExport ?? (() => {})}
              importJobs={importJobs}
              onRetryJob={onRetryJob}
              onArchiveJob={onArchiveJob}
              retryingJobId={retryingJobId}
            />
          )}
          {activeTab === "email" && (
            <EmailPanel
              connections={emailConnections}
              isLoading={emailLoading}
              onConnectGmail={onConnectGmail}
              onSync={onEmailSync}
              onDisconnect={onEmailDisconnect}
              onUpdateSyncInterval={onEmailUpdateSyncInterval}
              onUpdateMarkRead={onEmailUpdateMarkRead}
              syncingConnectionId={emailSyncingConnectionId}
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
          {activeTab === "organizations" && (
            <OrganizationsPanel
              organizations={organizations}
              isLoading={organizationsLoading}
              onCreateOrg={onCreateOrg}
              isCreating={isCreatingOrg}
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
          {activeTab === "agent-setup" && agentSettings && (
            <AgentSetupPanel
              settings={agentSettings}
              onUpdate={onAgentUpdate ?? (() => {})}
              onDeleteApiKey={onAgentDeleteApiKey}
              onStopContainer={onAgentStopContainer}
              onRestartContainer={onAgentRestartContainer}
              isSaving={agentSaving}
              isContainerActionPending={isContainerActionPending}
            />
          )}
          {activeTab === "developer" && (
            <DeveloperPanel
              onFlush={onFlush}
              canInstall={canInstall}
              onInstall={onInstall}
            />
          )}
        </div>
      </main>
    </div>
  );
}
