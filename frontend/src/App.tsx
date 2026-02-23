import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./lib/use-auth";
import { useLocationState } from "./hooks/use-location-state";
import { useImportJobs } from "./hooks/use-import-jobs";
import { useImportJobToasts } from "./hooks/use-import-job-toasts";
import { useIsMobile } from "./hooks/use-is-mobile";
import { useAllItems, useProjects, useReferences } from "./hooks/use-items";
import {
  useEmailConnections,
  useTriggerEmailSync,
  useDisconnectEmail,
  useUpdateEmailConnection,
} from "./hooks/use-email-connections";
import {
  useAgentSettings,
  useUpdateAgentSettings,
  useDeleteAgentApiKey,
  useStopContainer,
  useRestartContainer,
} from "./hooks/use-agent-settings";
import {
  useOrganizations,
  useCreateOrganization,
} from "./hooks/use-organizations";
import { computeBucketCounts } from "./lib/bucket-counts";
import { DevApi, EmailApi, downloadExport } from "./lib/api-client";
import type { AuthUser } from "./lib/api-client";
import { ConnectedBucketView } from "./components/work/ConnectedBucketView";
import { TayChatPanel } from "./components/chat/TayChatPanel";
import { useChatState } from "./hooks/use-chat-state";
import { AppHeader } from "./components/shell/AppHeader";
import type { MobileBucketNav } from "./components/shell/AppHeader";
import { ErrorBoundary } from "./components/shell/ErrorBoundary";
import { Icon } from "./components/ui/Icon";
import { OfflineBanner } from "./components/ui/OfflineBanner";
import { navItems } from "./components/work/bucket-nav-items";
import type { SettingsTab } from "./components/settings/SettingsScreen";
import type { AppView } from "./lib/route-utils";
import type { Bucket } from "./model/types";

const LoginPage = lazy(() =>
  import("./components/auth/LoginPage").then((m) => ({
    default: m.LoginPage,
  })),
);
const SettingsScreen = lazy(() =>
  import("./components/settings/SettingsScreen").then((m) => ({
    default: m.SettingsScreen,
  })),
);
const NirvanaImportDialog = lazy(() =>
  import("./features/imports/nirvana/NirvanaImportDialog").then((m) => ({
    default: m.NirvanaImportDialog,
  })),
);
const NativeImportDialog = lazy(() =>
  import("./features/imports/native/NativeImportDialog").then((m) => ({
    default: m.NativeImportDialog,
  })),
);

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Icon
        name="progress_activity"
        size={32}
        className="animate-spin text-blueprint-500"
      />
    </div>
  );
}

function App() {
  const { user, isLoading, login, register, logout } = useAuth();

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <LoginPage onLogin={login} onRegister={register} />
      </Suspense>
    );
  }

  return (
    <ErrorBoundary>
      <AuthenticatedApp user={user} onSignOut={logout} />
    </ErrorBoundary>
  );
}

function AuthenticatedApp({
  user,
  onSignOut,
}: {
  user: AuthUser;
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const { location, navigate } = useLocationState();
  const [showImport, setShowImport] = useState(false);
  const [showNativeImport, setShowNativeImport] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chat = useChatState();
  const {
    jobs: importJobs,
    checkDuplicate,
    retryJob,
    archiveJob,
  } = useImportJobs();
  useImportJobToasts(importJobs);
  const isMobile = useIsMobile();
  const { data: allItems = [] } = useAllItems();
  const { data: projects = [] } = useProjects();
  const { data: refs = [] } = useReferences();
  const { data: emailConnections, isLoading: emailLoading } =
    useEmailConnections();
  const triggerEmailSync = useTriggerEmailSync();
  const disconnectEmail = useDisconnectEmail();
  const updateEmailConnection = useUpdateEmailConnection();

  // Organizations
  const orgsQuery = useOrganizations();
  const createOrg = useCreateOrganization();

  // Agent settings
  const { data: agentSettingsData } = useAgentSettings();
  const updateAgentSettings = useUpdateAgentSettings();
  const deleteAgentApiKey = useDeleteAgentApiKey();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();

  const mobileBucketNav = useMemo<MobileBucketNav | undefined>(() => {
    if (!isMobile || location.view !== "workspace") return undefined;
    return {
      activeBucket: location.sub as Bucket,
      items: navItems,
      counts: computeBucketCounts(allItems, refs, projects),
      onBucketChange: (bucket: Bucket) => navigate("workspace", bucket),
    };
  }, [
    isMobile,
    location.view,
    location.sub,
    allItems,
    refs,
    projects,
    navigate,
  ]);

  const handleConnectGmail = useCallback(async () => {
    try {
      const { url } = await EmailApi.getGmailAuthUrl();
      const w = 500;
      const h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      window.open(
        url,
        "gmail-oauth",
        `width=${w},height=${h},left=${left},top=${top}`,
      );
    } catch (err) {
      console.error("Failed to get Gmail auth URL", err);
    }
  }, []);

  // Detect ?gmail=connected — signal parent via localStorage and close popup,
  // or navigate directly if this is a full-page redirect (no popup).
  // localStorage "storage" events only fire in *other* tabs/windows on the
  // same origin, which is exactly what we need for popup→parent signalling.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      // Signal the parent window via localStorage (works even after
      // cross-origin redirects through Google which null out window.opener)
      localStorage.setItem("gmail-connected", String(Date.now()));
      window.close();
      // If window.close() is ignored (full-page redirect, not a popup),
      // fall back to in-page navigation.
      navigate("settings", "email");
      params.delete("gmail");
      const clean =
        window.location.pathname +
        (params.size > 0 ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", clean);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  // Listen for localStorage signal from the OAuth popup
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === "gmail-connected") {
        localStorage.removeItem("gmail-connected");
        queryClient.invalidateQueries({ queryKey: ["email-connections"] });
        navigate("settings", "email");
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [queryClient, navigate]);

  const handleFlush = useCallback(async () => {
    const result = await DevApi.flush();
    await queryClient.resetQueries();
    return result;
  }, [queryClient]);

  const handleNavigate = useCallback(
    (view: AppView) => {
      if (view === "workspace") {
        navigate("workspace", "inbox");
      } else {
        navigate("settings", "import-export");
      }
    },
    [navigate],
  );

  const handleBucketChange = useCallback(
    (bucket: Bucket) => {
      navigate("workspace", bucket);
    },
    [navigate],
  );

  const handleSettingsTabChange = useCallback(
    (tab: SettingsTab) => {
      navigate("settings", tab);
    },
    [navigate],
  );

  return (
    <div className="min-h-screen bg-surface">
      <OfflineBanner />
      <div className="px-3 pb-3 pt-2 md:px-6 md:pb-6 md:pt-3">
        <AppHeader
          username={user.username ?? user.email}
          currentView={location.view}
          onNavigate={handleNavigate}
          onSignOut={onSignOut}
          onLogoClick={() => navigate("workspace", "inbox")}
          onToggleChat={() => setIsChatOpen((prev) => !prev)}
          isChatOpen={isChatOpen}
          mobileBucketNav={mobileBucketNav}
          appVersion="0.1.0"
          className="sticky top-2 z-30 mb-6 w-fit rounded-[var(--radius-lg)] border border-paper-200 bg-surface/95 px-2 py-1 shadow-sm backdrop-blur"
        />

        {/* Main workspace */}
        {location.view === "workspace" && (
          <ConnectedBucketView
            activeBucket={location.sub as Bucket}
            onBucketChange={handleBucketChange}
          />
        )}

        {/* Settings */}
        {location.view === "settings" && (
          <Suspense fallback={<LoadingFallback />}>
            <SettingsScreen
              activeTab={location.sub as SettingsTab}
              onTabChange={handleSettingsTabChange}
              onImportNative={() => setShowNativeImport(true)}
              onImportNirvana={() => setShowImport(true)}
              onExport={downloadExport}
              onFlush={handleFlush}
              importJobs={importJobs}
              onRetryJob={(id) => retryJob.mutate(id)}
              onArchiveJob={(id) => archiveJob.mutate(id)}
              retryingJobId={
                retryJob.isPending ? (retryJob.variables ?? null) : null
              }
              emailConnections={emailConnections}
              emailLoading={emailLoading}
              onConnectGmail={handleConnectGmail}
              onEmailSync={(id) => triggerEmailSync.mutate(id)}
              onEmailDisconnect={(id) => disconnectEmail.mutate(id)}
              onEmailUpdateSyncInterval={(id, minutes) =>
                updateEmailConnection.mutate({
                  id,
                  patch: { sync_interval_minutes: minutes },
                })
              }
              onEmailUpdateMarkRead={(id, markRead) =>
                updateEmailConnection.mutate({
                  id,
                  patch: { sync_mark_read: markRead },
                })
              }
              emailSyncingConnectionId={
                triggerEmailSync.isPending
                  ? (triggerEmailSync.variables ?? null)
                  : null
              }
              organizations={orgsQuery.data}
              organizationsLoading={orgsQuery.isLoading}
              onCreateOrg={(name) => createOrg.mutate(name)}
              isCreatingOrg={createOrg.isPending}
              agentSettings={
                agentSettingsData
                  ? {
                      agentBackend: agentSettingsData.agentBackend,
                      provider: agentSettingsData.provider,
                      hasApiKey: agentSettingsData.hasApiKey,
                      model: agentSettingsData.model,
                      containerStatus: agentSettingsData.containerStatus,
                      containerError: agentSettingsData.containerError,
                    }
                  : undefined
              }
              onAgentUpdate={(update) => updateAgentSettings.mutate(update)}
              onAgentDeleteApiKey={() => deleteAgentApiKey.mutate()}
              onAgentStopContainer={() => stopContainer.mutate()}
              onAgentRestartContainer={() => restartContainer.mutate()}
              agentSaving={updateAgentSettings.isPending}
              isContainerActionPending={
                stopContainer.isPending || restartContainer.isPending
              }
            />
          </Suspense>
        )}

        {/* Import dialogs */}
        <Suspense fallback={null}>
          <NirvanaImportDialog
            open={showImport}
            onClose={() => setShowImport(false)}
            onNavigateToBucket={(bucket) => navigate("workspace", bucket)}
            checkDuplicate={checkDuplicate}
          />
        </Suspense>
        <Suspense fallback={null}>
          <NativeImportDialog
            open={showNativeImport}
            onClose={() => setShowNativeImport(false)}
            onNavigateToBucket={(bucket) => navigate("workspace", bucket)}
            checkDuplicate={checkDuplicate}
          />
        </Suspense>
      </div>

      {/* Floating chat launcher (hidden while panel is open) */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          aria-label="Chat öffnen"
          title="Chat öffnen"
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-blueprint-200 bg-blueprint-600 text-white shadow-[var(--shadow-sheet)] transition-colors hover:bg-blueprint-700"
        >
          <Icon name="chat_bubble" size={22} />
        </button>
      )}

      {/* Chat Panel */}
      <TayChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chat.messages}
        isLoading={chat.isLoading}
        onSend={chat.sendMessage}
        onAcceptSuggestion={chat.acceptSuggestion}
        onDismissSuggestion={chat.dismissSuggestion}
        onNewConversation={chat.startNewConversation}
        onLoadConversation={chat.loadConversation}
        agentName={
          agentSettingsData?.agentBackend === "openclaw"
            ? "OpenClaw"
            : "Copilot"
        }
      />
    </div>
  );
}

export default App;
