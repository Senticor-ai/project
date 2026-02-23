import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface TabItem {
  id: string;
  label: string;
  icon: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onSelect: (tabId: string) => void;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onSelect,
  orientation = "vertical",
  className,
}: TabsProps) {
  return (
    <nav
      role="tablist"
      aria-orientation={orientation}
      className={cn(
        orientation === "vertical" ? "space-y-0.5" : "flex gap-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={isActive ? `tabpanel-${tab.id}` : undefined}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm",
              "transition-colors duration-[var(--duration-fast)]",
              orientation === "vertical" && "w-full",
              isActive
                ? "bg-blueprint-50 font-medium text-blueprint-700"
                : "text-text-muted hover:bg-paper-100 hover:text-text",
            )}
          >
            <Icon name={tab.icon} size={16} className="shrink-0" />
            <span className="flex-1 text-left">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
