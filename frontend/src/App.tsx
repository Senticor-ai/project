import { useState, useCallback } from "react";
import { useAuth } from "./lib/use-auth";
import { LoginPage } from "./components/auth/LoginPage";
import { ConnectedBucketView } from "./components/work/ConnectedBucketView";
import { NirvanaImportDialog } from "./components/work/NirvanaImportDialog";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { AppHeader, type AppView } from "./components/shell/AppHeader";
import { Icon } from "./components/ui/Icon";
import type { Bucket } from "./model/types";

function App() {
  const { user, isLoading, login, register, logout } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>("workspace");
  const [showImport, setShowImport] = useState(false);
  const [requestedBucket, setRequestedBucket] = useState<Bucket | null>(null);

  const handleNavigateToBucket = useCallback((bucket: Bucket) => {
    setRequestedBucket(bucket);
    setCurrentView("workspace");
  }, []);

  // Clear requested bucket once BucketView has consumed it
  const handleBucketChange = useCallback(() => {
    setRequestedBucket(null);
  }, []);

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
        currentView={currentView}
        onNavigate={setCurrentView}
        onSignOut={logout}
        className="mb-6"
      />

      {/* Main workspace */}
      {currentView === "workspace" && (
        <ConnectedBucketView
          requestedBucket={requestedBucket}
          onBucketChange={handleBucketChange}
        />
      )}

      {/* Settings */}
      {currentView === "settings" && (
        <SettingsScreen onImportNirvana={() => setShowImport(true)} />
      )}

      {/* Import dialog */}
      <NirvanaImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onNavigateToBucket={handleNavigateToBucket}
      />
    </div>
  );
}

export default App;
