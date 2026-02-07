import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AppMenu, type AppMenuSection } from "./AppMenu";
import type { AppView } from "@/lib/route-utils";

export type { AppView };

export interface AppHeaderProps {
  username: string;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  className?: string;
}

export function AppHeader({
  username,
  currentView,
  onNavigate,
  onSignOut,
  className,
}: AppHeaderProps) {
  const menuSections: AppMenuSection[] = useMemo(
    () => [
      {
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
      },
      {
        items: [
          {
            id: "sign-out",
            label: "Sign out",
            icon: "logout",
            onClick: onSignOut,
          },
        ],
      },
    ],
    [currentView, onNavigate, onSignOut],
  );

  return (
    <header className={cn("flex items-center justify-between", className)}>
      <div className="flex items-center gap-3">
        <AppMenu sections={menuSections} />
        <img src="/tay-logo.svg" alt="TAY" className="h-8 w-8" />
        <h1 className="font-mono text-xl font-bold text-blueprint-700">
          terminandoyo
        </h1>
      </div>
      <div className="flex items-center">
        <span className="text-xs text-text-subtle">{username}</span>
      </div>
    </header>
  );
}
