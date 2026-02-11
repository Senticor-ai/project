import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./lib/use-auth";
import { useLocationState } from "./hooks/use-location-state";
import { useImportJobs } from "./hooks/use-import-jobs";
import { useImportJobToasts } from "./hooks/use-import-job-toasts";
import { useIsMobile } from "./hooks/use-is-mobile";
import { useAllItems, useProjects, useReferences } from "./hooks/use-items";
import { computeBucketCounts } from "./lib/bucket-counts";
import { DevApi, downloadExport } from "./lib/api-client";
import type { AuthUser } from "./lib/api-client";
import { ConnectedBucketView } from "./components/work/ConnectedBucketView";
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
          mobileBucketNav={mobileBucketNav}
          appVersion="0.1.0"
          className="mb-6"
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
    </div>
  );
}

export default App;
