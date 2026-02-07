import { useState, useCallback } from "react";
import { useAuth } from "./lib/auth-context";
import { LoginPage } from "./components/auth/LoginPage";
import { ConnectedBucketView } from "./components/work/ConnectedBucketView";
import { NirvanaImportDialog } from "./components/work/NirvanaImportDialog";
import { Icon } from "./components/ui/Icon";
import type { Bucket } from "./model/types";

function App() {
  const { user, isLoading, login, register, logout } = useAuth();
  const [showImport, setShowImport] = useState(false);
  const [requestedBucket, setRequestedBucket] = useState<Bucket | null>(
    null,
  );

  const handleNavigateToBucket = useCallback((bucket: Bucket) => {
    setRequestedBucket(bucket);
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
      {/* App header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/tay-logo.svg" alt="TAY" className="h-8 w-8" />
          <h1 className="font-mono text-xl font-bold text-blueprint-700">
            terminandoyo
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-subtle">
            {user.username ?? user.email}
          </span>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-paper-100"
          >
            <Icon name="upload_file" size={14} />
            Import
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-paper-100"
          >
            <Icon name="logout" size={14} />
            Sign out
          </button>
        </div>
      </div>

      {/* Main workspace */}
      <ConnectedBucketView
        requestedBucket={requestedBucket}
        onBucketChange={handleBucketChange}
      />

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
