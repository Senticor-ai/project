import { useState, useMemo } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

export interface EmailBodyViewerProps {
  htmlBody: string;
  textBody?: string;
  sourceUrl?: string;
  senderName?: string;
  senderEmail?: string;
  className?: string;
}

export function EmailBodyViewer({
  htmlBody,
  textBody,
  sourceUrl,
  senderName,
  senderEmail,
  className,
}: EmailBodyViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sanitizedHtml = useMemo(() => {
    if (!htmlBody) return "";
    return DOMPurify.sanitize(htmlBody, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "b",
        "i",
        "u",
        "a",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "pre",
        "code",
        "span",
        "div",
        "table",
        "thead",
        "tbody",
        "tr",
        "td",
        "th",
        "img",
        "hr",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "style", "class"],
    });
  }, [htmlBody]);

  const hasHtml = sanitizedHtml.trim().length > 0;
  const hasText = (textBody ?? "").trim().length > 0;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-paper-50",
        className,
      )}
    >
      {/* Header: sender info + toggle */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon name="mail" size={14} className="text-text-muted" />
          {(senderName || senderEmail) && (
            <span className="text-xs text-text-muted">
              {senderName && (
                <span className="font-medium text-text-primary">
                  {senderName}
                </span>
              )}
              {senderName && senderEmail && " "}
              {senderEmail && (
                <span className="text-text-subtle">{senderEmail}</span>
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-label={isExpanded ? "E-Mail ausblenden" : "E-Mail anzeigen"}
          className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-text-subtle hover:bg-paper-100 hover:text-text"
        >
          <Icon name={isExpanded ? "expand_less" : "expand_more"} size={14} />
          {isExpanded ? "Ausblenden" : "E-Mail anzeigen"}
        </button>
      </div>

      {/* Body content (collapsible) */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-3">
          {hasHtml ? (
            <div
              className="prose prose-sm max-w-none text-xs text-text-primary [&_a]:text-blueprint-600 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : hasText ? (
            <pre className="whitespace-pre-wrap text-xs text-text-primary">
              {textBody}
            </pre>
          ) : (
            <p className="text-xs text-text-muted italic">
              Kein E-Mail-Inhalt verfügbar.
            </p>
          )}

          {/* Gmail link */}
          {sourceUrl && (
            <div className="mt-3 border-t border-border pt-2">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blueprint-600 hover:text-blueprint-700 hover:underline"
              >
                <Icon name="open_in_new" size={12} />
                In Gmail öffnen
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
