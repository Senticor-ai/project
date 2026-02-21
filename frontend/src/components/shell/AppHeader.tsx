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
  className?: string;
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
  className,
}: AppHeaderProps) {
  const menuSections: AppMenuSection[] = useMemo(() => {
    const headerSection: AppMenuSection = {
      header: { username, appName: "project", appVersion },
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

    if (!mobileBucketNav) {
      return [headerSection, navSection, signOutSection];
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

    return [headerSection, navSection, bucketSection, signOutSection];
  }, [
    currentView,
    onNavigate,
    onSignOut,
    mobileBucketNav,
    username,
    appVersion,
  ]);

  return (
    <header className={cn("flex items-center justify-between", className)}>
      {/* Mobile: hamburger left, logo right */}
      {/* Desktop: logo left, hamburger right */}
      <div className="flex items-center gap-3 md:order-2">
        {onToggleChat && (
          <button
            onClick={onToggleChat}
            aria-label={isChatOpen ? "Chat schließen" : "Chat mit Tay"}
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
      <button
        onClick={onLogoClick}
        className="cursor-pointer md:order-1"
        aria-label="Go to Inbox"
        title="project"
      >
        <img src="/tay-logo.svg" alt="TAY" className="h-8 w-8" />
      </button>
    </header>
  );
}
