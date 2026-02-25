import type { CSSProperties, ReactNode } from "react";

interface SlideProps {
  /** Slide number badge (01, 02, …) */
  n?: number;
  /** Bold headline displayed in the slide header */
  title?: string;
  /** Right-aligned tag/metadata (e.g. "Product" or "Week 9") */
  tag?: string;
  /** Force a page break before this slide when printing */
  breakBefore?: boolean;
  children: ReactNode;
}

const card: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderLeft: "4px solid #1a6fa0",
  borderRadius: "8px",
  padding: "2rem",
  marginBottom: "2rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  pageBreakInside: "avoid",
  breakInside: "avoid",
};

const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  marginBottom: "1.25rem",
  paddingBottom: "0.75rem",
  borderBottom: "1px solid #e2e8f0",
};

const badge: CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#1a6fa0",
  fontFamily: "JetBrains Mono, monospace",
  minWidth: "1.5rem",
  letterSpacing: "0.05em",
};

const headline: CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 700,
  color: "#0f172a",
  flex: 1,
  margin: 0,
};

const tagStyle: CSSProperties = {
  fontSize: "0.7rem",
  color: "#64748b",
  fontFamily: "JetBrains Mono, monospace",
  letterSpacing: "0.03em",
};

export function Slide({ n, title, tag, breakBefore, children }: SlideProps) {
  const hasHeader = n !== undefined || !!title || !!tag;

  return (
    <div
      data-slide
      {...(breakBefore ? { "data-slide-break": "before" } : {})}
      style={card}
    >
      {hasHeader && (
        <div style={header}>
          {n !== undefined && (
            <span style={badge}>{String(n).padStart(2, "0")}</span>
          )}
          {title && <span style={headline}>{title}</span>}
          {tag && <span style={tagStyle}>{tag}</span>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}
