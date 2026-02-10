import { cn } from "@/lib/utils";

export interface IconProps {
  /** Google Material Symbol name, e.g. "inbox", "bolt", "check_circle" */
  name: string;
  /** Icon size in px (default 20) */
  size?: number;
  /** Use filled variant */
  fill?: boolean;
  className?: string;
}

export function Icon({ name, size = 20, fill = false, className }: IconProps) {
  return (
    <span
      className={cn(
        "material-symbols-outlined inline-block select-none overflow-hidden leading-none",
        className,
      )}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
