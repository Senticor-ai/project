import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AppMenu, type AppMenuSection } from "./AppMenu";
import { Icon } from "@/components/ui/Icon";
import type { AppView } from "@/lib/route-utils";
import type { Bucket } from "@/model/types";
import type { BucketNavItemConfig } from "@/components/work/bucket-nav-items";

export type { AppView };

export interface MobileBucketNav {
  activeBucket: Bucket;
  items: BucketNavItemConfig[];
  counts: Partial<Record<Bucket, number>>;
  onBucketChange: (bucket: Bucket) => void;
}

export interface AppHeaderProps {
  username: string;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  onLogoClick: () => void;
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  mobileBucketNav?: MobileBucketNav;
  appVersion?: string;
  canInstall?: boolean;
  onInstall?: () => void;
  showControls?: boolean;
  className?: string;
}

export interface AppHeaderControlsProps {
  username: string;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  mobileBucketNav?: MobileBucketNav;
  appVersion?: string;
  canInstall?: boolean;
  onInstall?: () => void;
  className?: string;
}

export function AppHeaderControls({
  username,
  currentView,
  onNavigate,
  onSignOut,
  onToggleChat,
  isChatOpen,
  mobileBucketNav,
  appVersion,
  canInstall,
  onInstall,
  className,
}: AppHeaderControlsProps) {
  const menuSections: AppMenuSection[] = useMemo(() => {
    const headerSection: AppMenuSection = {
      header: { username, appName: "Senticor Project", appVersion },
      items: [],
    };

    const navSection: AppMenuSection = {
      items: [
        {
          id: "workspace",
          label: "Workspace",
          icon: "dashboard",
          active: currentView === "workspace",
          onClick: () => onNavigate("workspace"),
        },
        {
          id: "settings",
          label: "Settings",
          icon: "settings",
          active: currentView === "settings",
          onClick: () => onNavigate("settings"),
        },
      ],
    };

    const installSection: AppMenuSection | null =
      canInstall && onInstall
        ? {
            items: [
              {
                id: "install-app",
                label: "Install app",
                icon: "install_mobile",
                onClick: onInstall,
              },
            ],
          }
        : null;

    const signOutSection: AppMenuSection = {
      items: [
        {
          id: "sign-out",
          label: "Sign out",
          icon: "logout",
          onClick: onSignOut,
        },
      ],
    };

    const trailing: AppMenuSection[] = [
      ...(installSection ? [installSection] : []),
      signOutSection,
    ];

    if (!mobileBucketNav) {
      return [headerSection, navSection, ...trailing];
    }

    const bucketSection: AppMenuSection = {
      label: "Buckets",
      items: mobileBucketNav.items.map(({ bucket, label, icon }) => {
        const count = mobileBucketNav.counts[bucket];
        return {
          id: `bucket-${bucket}`,
          label: count ? `${label} (${count})` : label,
          icon,
          active: mobileBucketNav.activeBucket === bucket,
          onClick: () => mobileBucketNav.onBucketChange(bucket),
        };
      }),
    };

    return [headerSection, navSection, bucketSection, ...trailing];
  }, [
    currentView,
    onNavigate,
    onSignOut,
    mobileBucketNav,
    username,
    appVersion,
    canInstall,
    onInstall,
  ]);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {onToggleChat && (
        <button
          onClick={onToggleChat}
          aria-label={isChatOpen ? "Chat minimieren" : "Chat mit Copilot"}
          aria-pressed={isChatOpen}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            isChatOpen
              ? "bg-blueprint-100 text-blueprint-600"
              : "text-text-muted hover:bg-paper-100",
          )}
        >
          <Icon name="chat_bubble" size={20} />
        </button>
      )}
      <AppMenu sections={menuSections} />
    </div>
  );
}

export function AppHeader({
  username,
  currentView,
  onNavigate,
  onSignOut,
  onLogoClick,
  onToggleChat,
  isChatOpen,
  mobileBucketNav,
  appVersion,
  canInstall,
  onInstall,
  showControls = true,
  className,
}: AppHeaderProps) {
  return (
    <header className={cn("flex items-center gap-2", className)}>
      <button
        onClick={onLogoClick}
        className="cursor-pointer shrink-0"
        aria-label="Go to Inbox"
        title="Senticor Project"
      >
        <img
          src="/copilot-logo.svg"
          alt="Senticor Project"
          className="h-8 w-8"
        />
      </button>
      {showControls && (
        <AppHeaderControls
          username={username}
          currentView={currentView}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
          onToggleChat={onToggleChat}
          isChatOpen={isChatOpen}
          mobileBucketNav={mobileBucketNav}
          appVersion={appVersion}
          canInstall={canInstall}
          onInstall={onInstall}
          className="gap-1.5"
        />
      )}
    </header>
  );
}
