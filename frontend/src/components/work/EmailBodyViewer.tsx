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
  onArchive?: () => void;
}

function extractPlaintext(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

export function EmailBodyViewer({
  htmlBody,
  textBody,
  sourceUrl,
  senderName,
  senderEmail,
  className,
  onArchive,
}: EmailBodyViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const sanitizedHtml = useMemo(() => {
    if (!htmlBody) return "";
    let html = DOMPurify.sanitize(htmlBody, {
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
    // Strip fixed inline widths that cause overflow on mobile
    html = html.replace(/\s*(min-)?width\s*:\s*\d+px/gi, "");
    return html;
  }, [htmlBody]);

  const hasHtml = sanitizedHtml.trim().length > 0;
  const hasText = (textBody ?? "").trim().length > 0;

  async function handleCopy() {
    const text = extractPlaintext(sanitizedHtml);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-paper-50",
        className,
      )}
    >
      {/* Header: sender info + copy button + toggle — entire header is clickable */}
      <div
        className="flex cursor-pointer flex-col gap-1 px-3 py-2 md:flex-row md:items-center md:justify-between md:gap-0"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
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
        <div className="flex items-center gap-1">
          {isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleCopy();
              }}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-text-subtle hover:bg-paper-100 hover:text-text"
            >
              <Icon name={copied ? "check" : "content_copy"} size={14} />
              {copied ? "Kopiert!" : "Kopieren"}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            aria-label={isExpanded ? "E-Mail ausblenden" : "E-Mail anzeigen"}
            aria-expanded={isExpanded}
            className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-text-subtle hover:bg-paper-100 hover:text-text"
          >
            <Icon name={isExpanded ? "expand_less" : "expand_more"} size={14} />
            {isExpanded ? "Ausblenden" : "E-Mail anzeigen"}
          </button>
        </div>
      </div>

      {/* Body content (collapsible) */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-3">
          {hasHtml ? (
            <div
              className="prose prose-sm max-w-none text-xs text-text-primary
                overflow-x-auto break-words
                [&_table]:max-w-full [&_table]:w-full [&_table]:table-fixed
                [&_td]:break-words [&_th]:break-words
                [&_img]:max-w-full [&_img]:h-auto
                [&_a]:text-blueprint-600 [&_a]:underline"
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

          {/* Footer: Gmail link + archive */}
          {(sourceUrl || onArchive) && (
            <div className="mt-3 border-t border-border pt-2">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blueprint-600 hover:text-blueprint-700 hover:underline"
                  >
                    <Icon name="open_in_new" size={12} />
                    In Gmail öffnen
                  </a>
                )}
                {onArchive && (
                  <button
                    type="button"
                    onClick={onArchive}
                    className="inline-flex items-center gap-1 text-xs text-text-subtle hover:bg-paper-100 hover:text-text rounded-[var(--radius-sm)] px-2 py-1"
                  >
                    <Icon name="archive" size={12} />
                    Archivieren
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
