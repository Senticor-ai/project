import { useState, useMemo, useRef, useEffect } from "react";
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
  /** When true, email body starts expanded on mount. */
  defaultExpanded?: boolean;
}

function extractPlaintext(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent ?? "";
}

type CssLength =
  | { kind: "length"; px: number }
  | { kind: "unitless"; value: number };

function parseCssLength(value: string): CssLength | null {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(-?\d*\.?\d+)(px|pt|rem|em)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return null;
  if (!unit) return { kind: "unitless", value: amount };
  if (unit === "px") return { kind: "length", px: amount };
  if (unit === "pt") return { kind: "length", px: amount * (96 / 72) };
  return { kind: "length", px: amount * 16 };
}

function formatPx(px: number): string {
  return `${Math.round(px * 100) / 100}px`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMaxFontSizePx(tagName: string, isCta: boolean): number {
  if (isCta) return 14;
  switch (tagName) {
    case "H1":
      return 18;
    case "H2":
      return 16;
    case "H3":
      return 15;
    case "H4":
    case "H5":
    case "H6":
      return 14;
    case "SMALL":
      return 11;
    default:
      return 15;
  }
}

function isLikelyCta(element: HTMLElement): boolean {
  const text = element.textContent?.trim() ?? "";
  if (!text) return false;
  const tagName = element.tagName;
  if (!["A", "BUTTON", "TD"].includes(tagName)) return false;
  const inlineStyle = element.getAttribute("style")?.toLowerCase() ?? "";
  const style = element.style;
  const hasSurface =
    /background(?:-color)?\s*:/.test(inlineStyle) ||
    /border(?:-radius)?\s*:/.test(inlineStyle) ||
    Boolean(style.background) ||
    Boolean(style.backgroundColor) ||
    Boolean(style.border) ||
    Boolean(style.borderRadius);
  const hasPadding =
    /padding(?:-[a-z]+)?\s*:/.test(inlineStyle) ||
    Boolean(style.padding) ||
    Boolean(style.paddingTop) ||
    Boolean(style.paddingBottom) ||
    Boolean(style.paddingLeft) ||
    Boolean(style.paddingRight);
  return hasSurface && hasPadding;
}

function normalizeInlineStyleAttribute(styleText: string): string {
  return styleText
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("; ");
}

function stripStyleProperties(
  element: HTMLElement,
  properties: readonly string[],
) {
  const { style } = element;
  let styleText = element.getAttribute("style") ?? "";

  properties.forEach((property) => {
    if (style.getPropertyValue(property).trim().length > 0) {
      style.removeProperty(property);
    }
    styleText = styleText.replace(
      new RegExp(
        `(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*[^;"]*;?`,
        "gi",
      ),
      ";",
    );
  });

  const normalizedStyle = normalizeInlineStyleAttribute(styleText);
  if (normalizedStyle.length > 0) {
    element.setAttribute("style", normalizedStyle);
  } else if (!element.getAttribute("style") || normalizedStyle.length === 0) {
    element.removeAttribute("style");
  }
}

function hasStyleProperties(
  element: HTMLElement,
  properties: readonly string[],
): boolean {
  const { style } = element;
  const styleText = element.getAttribute("style") ?? "";
  return properties.some(
    (property) =>
      style.getPropertyValue(property).trim().length > 0 ||
      new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:`, "i").test(
        styleText,
      ),
  );
}

function clampFontSize(
  style: CSSStyleDeclaration,
  tagName: string,
  isCta: boolean,
) {
  const parsed = parseCssLength(style.getPropertyValue("font-size"));
  if (parsed?.kind !== "length") return;
  const maxPx = getMaxFontSizePx(tagName, isCta);
  if (parsed.px > maxPx) {
    style.setProperty("font-size", formatPx(maxPx));
  }
}

function clampLineHeight(style: CSSStyleDeclaration, isCta: boolean) {
  const parsed = parseCssLength(style.getPropertyValue("line-height"));
  if (!parsed) return;
  if (parsed.kind === "unitless") {
    if (parsed.value > 1.6) {
      style.setProperty("line-height", isCta ? "1.35" : "1.5");
    }
    return;
  }
  const maxPx = isCta ? 20 : 24;
  if (parsed.px > maxPx) {
    style.setProperty("line-height", formatPx(maxPx));
  }
}

function clampPadding(
  style: CSSStyleDeclaration,
  property: string,
  maxPx: number,
) {
  const parsed = parseCssLength(style.getPropertyValue(property));
  if (parsed?.kind === "length" && parsed.px > maxPx) {
    style.setProperty(property, formatPx(maxPx));
  }
}

function normalizeTypography(
  element: HTMLElement,
  tagName: string,
  isCta: boolean,
  hasProblematicSizing: boolean,
) {
  const { style } = element;
  if (isCta) {
    clampFontSize(style, tagName, true);
    clampLineHeight(style, true);
    return;
  }

  const typographyProperties = ["font-size", "line-height"] as const;

  if (hasProblematicSizing || !["DIV", "SPAN"].includes(tagName)) {
    stripStyleProperties(element, typographyProperties);
    return;
  }

  const fontSizeValue = style.getPropertyValue("font-size").trim();
  if (fontSizeValue.length > 0) {
    const parsedFontSize = parseCssLength(fontSizeValue);
    if (parsedFontSize?.kind === "length") {
      const maxPx = getMaxFontSizePx(tagName, false);
      if (parsedFontSize.px > maxPx) {
        style.setProperty("font-size", formatPx(maxPx));
      }
    } else {
      stripStyleProperties(element, ["font-size"]);
    }
  }

  const lineHeightValue = style.getPropertyValue("line-height").trim();
  if (lineHeightValue.length > 0) {
    const parsedLineHeight = parseCssLength(lineHeightValue);
    if (!parsedLineHeight) {
      stripStyleProperties(element, ["line-height"]);
    } else if (parsedLineHeight.kind === "unitless") {
      if (parsedLineHeight.value > 1.6) {
        style.setProperty("line-height", "1.5");
      }
    } else if (parsedLineHeight.px > 24) {
      style.setProperty("line-height", formatPx(24));
    }
  }
}

function normalizeEmailPreviewHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const elements = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));

  for (const element of elements) {
    const isCta = isLikelyCta(element);
    if (isCta) {
      element.classList.add("inline-email-cta");
    }

    const { style } = element;
    const hasProblematicSizing = hasStyleProperties(element, [
      "width",
      "min-width",
      "max-width",
      "height",
      "max-height",
    ]);
    stripStyleProperties(element, [
      "width",
      "min-width",
      "max-width",
      "height",
      "max-height",
    ]);

    if (element.tagName === "IMG") {
      if (!style.getPropertyValue("max-width")) {
        style.setProperty("max-width", "100%");
      }
      if (!style.getPropertyValue("height")) {
        style.setProperty("height", "auto");
      }
    }

    normalizeTypography(element, element.tagName, isCta, hasProblematicSizing);

    if (isCta) {
      clampPadding(style, "padding-top", 10);
      clampPadding(style, "padding-bottom", 10);
      clampPadding(style, "padding-left", 18);
      clampPadding(style, "padding-right", 18);
      const borderRadius = parseCssLength(
        style.getPropertyValue("border-radius"),
      );
      if (borderRadius?.kind === "length" && borderRadius.px > 14) {
        style.setProperty("border-radius", formatPx(14));
      }
    }
  }

  return doc.body.innerHTML;
}

export function EmailBodyViewer({
  htmlBody,
  textBody,
  sourceUrl,
  senderName,
  senderEmail,
  className,
  onArchive,
  defaultExpanded = false,
}: EmailBodyViewerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const sanitizedHtml = useMemo(() => {
    if (!htmlBody) return "";
    const html = DOMPurify.sanitize(htmlBody, {
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
    return normalizeEmailPreviewHtml(html);
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
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
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
        className="flex cursor-pointer flex-col gap-1 px-3 py-1.5 md:flex-row md:items-center md:justify-between md:gap-0"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <Icon name="mail" size={12} className="text-text-muted" />
          {(senderName || senderEmail) && (
            <span className="text-[11px] text-text-muted">
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
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[11px] text-text-subtle hover:bg-paper-100 hover:text-text"
            >
              <Icon name={copied ? "check" : "content_copy"} size={12} />
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
            className="flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[11px] text-text-subtle hover:bg-paper-100 hover:text-text"
          >
            <Icon name={isExpanded ? "expand_less" : "expand_more"} size={12} />
            {isExpanded ? "Ausblenden" : "E-Mail anzeigen"}
          </button>
        </div>
      </div>

      {/* Body content (collapsible) */}
      {isExpanded && (
        <div className="border-t border-border px-3 py-2.5">
          {hasHtml ? (
            // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
            // Threat model: sanitizedHtml is pre-sanitized by DOMPurify with an
            // explicit allowlist of safe tags/attributes (see useMemo above).
            // This is the standard React pattern for rendering sanitized HTML.
            <div
              className="prose email-body-content max-w-2xl text-[13px] leading-5 text-text-primary
                overflow-x-auto break-words
                [&_*]:max-w-full
                [&_div]:!text-[13px] [&_div]:!leading-5
                [&_p]:!my-0 [&_p]:!text-[13px] [&_p]:!leading-5
                [&_p+*]:!mt-3
                [&_span]:![line-height:inherit]
                [&_li]:!text-[13px] [&_li]:!leading-5
                [&_td]:!text-[12.5px] [&_td]:!leading-5
                [&_th]:!text-[12.5px] [&_th]:!leading-5
                [&_small]:!text-[11px]
                [&_h1]:!text-base [&_h1]:!leading-6
                [&_h2]:!text-[15px] [&_h2]:!leading-6
                [&_h3]:!text-sm [&_h3]:!leading-5
                [&_table]:max-w-full [&_table]:w-full [&_table]:table-fixed
                [&_td]:break-words [&_th]:break-words
                [&_img]:max-w-full [&_img]:!h-auto [&_img]:rounded-[var(--radius-sm)]
                [&_a]:text-blueprint-600 [&_a]:underline
                [&_.inline-email-cta]:!inline-flex
                [&_.inline-email-cta]:!w-auto
                [&_.inline-email-cta]:!max-w-full
                [&_.inline-email-cta]:!items-center
                [&_.inline-email-cta]:!justify-center
                [&_.inline-email-cta]:!gap-1.5
                [&_.inline-email-cta]:!px-[18px]
                [&_.inline-email-cta]:!py-[10px]
                [&_.inline-email-cta]:!text-[14px]
                [&_.inline-email-cta]:!leading-5
                [&_.inline-email-cta]:!rounded-[14px]
                [&_.inline-email-cta]:!no-underline"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : hasText ? (
            <pre className="whitespace-pre-wrap text-[12px] leading-5 text-text-primary">
              {textBody}
            </pre>
          ) : (
            <p className="text-[11px] text-text-muted italic">
              Kein E-Mail-Inhalt verfügbar.
            </p>
          )}

          {/* Footer: Gmail link + archive */}
          {(sourceUrl || onArchive) && (
            <div className="mt-2.5 border-t border-border pt-2">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blueprint-600 hover:text-blueprint-700 hover:underline"
                  >
                    <Icon name="open_in_new" size={10} />
                    In Gmail öffnen
                  </a>
                )}
                {onArchive && (
                  <button
                    type="button"
                    onClick={onArchive}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[11px] text-text-subtle hover:bg-paper-100 hover:text-text"
                  >
                    <Icon name="archive" size={10} />
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
