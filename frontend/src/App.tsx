import { useState, useCallback } from "react";
import { useAuth } from "./lib/use-auth";
import { useLocationState } from "./hooks/use-location-state";
import { useImportJobs } from "./hooks/use-import-jobs";
import { LoginPage } from "./components/auth/LoginPage";
import { ConnectedBucketView } from "./components/work/ConnectedBucketView";
import { NirvanaImportDialog } from "./components/work/NirvanaImportDialog";
import {
  SettingsScreen,
  type SettingsTab,
} from "./components/settings/SettingsScreen";
import { AppHeader } from "./components/shell/AppHeader";
import { Icon } from "./components/ui/Icon";
import type { AppView } from "./lib/route-utils";
import type { Bucket } from "./model/types";

function App() {
  const { user, isLoading, login, register, logout } = useAuth();
  const { location, navigate } = useLocationState();
  const [showImport, setShowImport] = useState(false);
  const { jobs: importJobs, checkDuplicate } = useImportJobs();

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

  if (isLoading) {
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

  if (!user) {
    return <LoginPage onLogin={login} onRegister={register} />;
  }

  return (
    <div className="min-h-screen bg-surface p-6">
      <AppHeader
        username={user.username ?? user.email}
        currentView={location.view}
        onNavigate={handleNavigate}
        onSignOut={logout}
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
        <SettingsScreen
          activeTab={location.sub as SettingsTab}
          onTabChange={handleSettingsTabChange}
          onImportNirvana={() => setShowImport(true)}
          importJobs={importJobs}
        />
      )}

      {/* Import dialog */}
      <NirvanaImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onNavigateToBucket={(bucket) => navigate("workspace", bucket)}
        checkDuplicate={checkDuplicate}
      />
    </div>
  );
}

export default App;
