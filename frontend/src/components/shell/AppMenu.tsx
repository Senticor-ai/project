import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface AppMenuItem {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
}

export interface AppMenuSectionHeader {
  username: string;
  appName: string;
  appVersion?: string;
}

export interface AppMenuSection {
  label?: string;
  header?: AppMenuSectionHeader;
  items: AppMenuItem[];
}

export interface AppMenuProps {
  sections: AppMenuSection[];
  className?: string;
}

export function AppMenu({ sections, className }: AppMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  // Focus first item when menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstItem =
        menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [isOpen]);

  const handleItemClick = useCallback((item: AppMenuItem) => {
    item.onClick();
    setIsOpen(false);
  }, []);

  // Arrow key navigation within menu
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!menuRef.current) return;
    const items = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const current = document.activeElement as HTMLElement;
    const idx = items.indexOf(current as HTMLButtonElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = idx < items.length - 1 ? idx + 1 : 0;
      items[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = idx > 0 ? idx - 1 : items.length - 1;
      items[prev]?.focus();
    }
  }, []);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        aria-label="Main menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "rounded-[var(--radius-md)] p-2 transition-colors duration-[var(--duration-fast)]",
          isOpen
            ? "bg-paper-100 text-text"
            : "text-text-muted hover:bg-paper-100 hover:text-text",
        )}
      >
        <Icon name="menu" size={20} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Main menu"
          onKeyDown={handleKeyDown}
          className="absolute left-0 top-full z-50 mt-1 max-h-[80vh] w-56 overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-paper-50 py-1 shadow-[var(--shadow-overlay)] md:left-auto md:right-0"
        >
          {sections.map((section, sIdx) => (
            <div key={sIdx}>
              {sIdx > 0 && section.items.length > 0 && (
                <div className="my-1 border-t border-paper-200" />
              )}
              {section.header && (
                <div className="px-3 pb-1 pt-2">
                  <div className="text-sm font-medium text-text">
                    {section.header.username}
                  </div>
                  <div className="text-[10px] text-text-subtle">
                    {section.header.appName}
                    {section.header.appVersion &&
                      ` v${section.header.appVersion}`}
                  </div>
                </div>
              )}
              {section.label && (
                <>
                  {sIdx > 0 && (
                    <div className="my-1 border-t border-paper-200" />
                  )}
                  <span className="block px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-text-subtle">
                    {section.label}
                  </span>
                </>
              )}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm",
                    "transition-colors duration-[var(--duration-fast)]",
                    item.active
                      ? "bg-blueprint-50 font-medium text-blueprint-700"
                      : "text-text-muted hover:bg-paper-100 hover:text-text",
                  )}
                >
                  <Icon name={item.icon} size={16} className="shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
