import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CSSProperties } from "react";

function getSlidesIn(container: HTMLDivElement | null): Element[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll("[data-slide]"));
}

const nav: CSSProperties = {
  position: "fixed",
  bottom: "1.5rem",
  right: "1.5rem",
  display: "flex",
  alignItems: "center",
  gap: "0.15rem",
  background: "rgba(15, 23, 42, 0.9)",
  color: "#f8fafc",
  padding: "0.4rem 0.6rem",
  borderRadius: "2rem",
  boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
  fontSize: "0.8rem",
  fontFamily: "JetBrains Mono, monospace",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  zIndex: 9999,
  userSelect: "none",
};

const btn: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#f8fafc",
  padding: "0.25rem 0.5rem",
  cursor: "pointer",
  borderRadius: "0.25rem",
  fontSize: "0.8rem",
  fontFamily: "JetBrains Mono, monospace",
  lineHeight: 1,
};

const btnDisabled: CSSProperties = {
  ...btn,
  opacity: 0.25,
  cursor: "default",
};

const counter: CSSProperties = {
  padding: "0 0.35rem",
  fontVariantNumeric: "tabular-nums",
  fontSize: "0.75rem",
  opacity: 0.7,
  minWidth: "3.5rem",
  textAlign: "center",
};

const sep: CSSProperties = {
  color: "rgba(248,250,252,0.25)",
  padding: "0 0.15rem",
  fontSize: "0.65rem",
};

const SLIDEDOC_SEQUENCE = [
  "slidedocs-product-overview--docs",
  "slidedocs-vision-methodology--docs",
  "slidedocs-team-how-we-work--docs",
  "slidedocs-architecture--docs",
  "slidedocs-data-model--docs",
  "slidedocs-design-system--docs",
  "slidedocs-roadmap--docs",
  "slidedocs-user-flows--docs",
  "slidedocs-dark-software-factory--docs",
  "slidedocs-status--docs",
] as const;

interface SlideShowProps {
  children: ReactNode;
}

type PresentationSlideTarget = "first" | "last";

function isPresentationMode(): boolean {
  if (typeof window === "undefined") return false;
  const inWindow =
    new URLSearchParams(window.location.search).get("full") === "1";
  if (inWindow) return true;

  try {
    if (window.parent !== window) {
      return (
        new URLSearchParams(window.parent.location.search).get("full") === "1"
      );
    }
  } catch {
    // cross-origin parent — ignore
  }

  return false;
}

function parseStorybookId(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("/docs/")) return path.slice("/docs/".length);
  if (path.startsWith("/story/")) return path.slice("/story/".length);
  return null;
}

function getStorybookIdFromUrl(url: URL): string | null {
  const id = url.searchParams.get("id");
  if (id) return id;
  return parseStorybookId(url.searchParams.get("path"));
}

function getAdjacentSlidedocId(
  currentId: string | null,
  direction: -1 | 1,
): string | null {
  if (!currentId) return null;
  const currentIdx = SLIDEDOC_SEQUENCE.indexOf(
    currentId as (typeof SLIDEDOC_SEQUENCE)[number],
  );
  if (currentIdx < 0) return null;
  return SLIDEDOC_SEQUENCE[currentIdx + direction] ?? null;
}

function buildPresentationIframeUrl(
  storyId: string,
  slide: PresentationSlideTarget = "first",
): string {
  const iframeUrl = new URL("/iframe.html", window.location.origin);
  iframeUrl.searchParams.set("id", storyId);
  iframeUrl.searchParams.set("viewMode", "docs");
  iframeUrl.searchParams.set("full", "1");
  if (slide === "last") {
    iframeUrl.searchParams.set("slide", "last");
  }
  return iframeUrl.toString();
}

function getInitialSlideTargetFromQuery(): PresentationSlideTarget {
  if (typeof window === "undefined") return "first";
  const slide = new URLSearchParams(window.location.search).get("slide");
  return slide === "last" ? "last" : "first";
}

function getPresentationUrl(): string {
  const current = new URL(window.location.href);
  const storyId = getStorybookIdFromUrl(current);
  if (storyId) {
    return buildPresentationIframeUrl(storyId);
  }

  // Fallback when there is no story id in URL.
  current.searchParams.set("full", "1");
  current.searchParams.set("viewMode", "docs");
  return current.toString();
}

export function SlideShow({ children }: SlideShowProps) {
  const containerNode = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef(0);
  const initialSlideTargetRef = useRef<PresentationSlideTarget>(
    getInitialSlideTargetFromQuery(),
  );
  const [isPresentation] = useState(isPresentationMode);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);

  // Callback ref: reads the DOM once on mount to count slides.
  // Avoids calling setState inside a useEffect body.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerNode.current = node;
    if (!node) return;

    const slides = getSlidesIn(node);
    setTotal(slides.length);

    if (initialSlideTargetRef.current === "last" && slides.length > 0) {
      const target = slides.length - 1;
      currentRef.current = target;
      setCurrent(target);
    }
    initialSlideTargetRef.current = "first";

    const url = new URL(window.location.href);
    if (url.searchParams.has("slide")) {
      url.searchParams.delete("slide");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  useEffect(() => {
    const node = containerNode.current;
    if (!node) return;

    const updateTotal = () => {
      setTotal(getSlidesIn(node).length);
    };

    updateTotal();
    const observer = new MutationObserver(updateTotal);
    observer.observe(node, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [children]);

  const navigateToAdjacentDeck = useCallback(
    (direction: -1 | 1): boolean => {
      if (!isPresentation) return false;
      const currentUrl = new URL(window.location.href);
      const adjacentId = getAdjacentSlidedocId(
        getStorybookIdFromUrl(currentUrl),
        direction,
      );
      if (!adjacentId) return false;

      const targetSlide: PresentationSlideTarget =
        direction < 0 ? "last" : "first";
      window.location.assign(
        buildPresentationIframeUrl(adjacentId, targetSlide),
      );
      return true;
    },
    [isPresentation],
  );

  const goTo = useCallback(
    (index: number) => {
      const slides = getSlidesIn(containerNode.current);
      if (!slides.length) return;

      if (index < 0 && navigateToAdjacentDeck(-1)) {
        return;
      }
      if (index > slides.length - 1 && navigateToAdjacentDeck(1)) {
        return;
      }

      const target = Math.max(0, Math.min(index, slides.length - 1));
      currentRef.current = target;
      setCurrent(target);
      if (!isPresentation) {
        slides[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [isPresentation, navigateToAdjacentDeck],
  );

  useEffect(() => {
    const slides = getSlidesIn(containerNode.current);
    if (!slides.length) return;

    slides.forEach((slide, i) => {
      const isActive = i === current;
      const hasVisual = Boolean(
        slide.querySelector(
          "[data-slide-visual], table, pre, figure, img, svg",
        ),
      );
      slide.setAttribute("data-slide-active", isActive ? "true" : "false");
      slide.setAttribute("data-slide-has-visual", hasVisual ? "true" : "false");
      if (isPresentation) {
        slide.setAttribute("aria-hidden", isActive ? "false" : "true");
      } else {
        slide.removeAttribute("aria-hidden");
      }
    });
  }, [current, isPresentation, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          goTo(currentRef.current + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          goTo(currentRef.current - 1);
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(getSlidesIn(containerNode.current).length - 1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const openPresent = () => {
    try {
      const isInIframe = window.parent !== window;
      const targetUrl = getPresentationUrl();
      window.open(targetUrl, "_blank");
      if (isInIframe) {
        window.focus();
      }
    } catch {
      // cross-origin parent — silently ignore
    }
  };

  const openDocs = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("full");
    url.searchParams.delete("nav");
    url.searchParams.delete("panel");
    url.searchParams.delete("addons");
    url.searchParams.delete("toolbar");
    window.location.assign(url.toString());
  };

  const currentStoryId =
    typeof window === "undefined"
      ? null
      : getStorybookIdFromUrl(new URL(window.location.href));
  const hasPrevDeck = Boolean(
    isPresentation && getAdjacentSlidedocId(currentStoryId, -1),
  );
  const hasNextDeck = Boolean(
    isPresentation && getAdjacentSlidedocId(currentStoryId, 1),
  );
  const currentDeckIndex = currentStoryId
    ? SLIDEDOC_SEQUENCE.indexOf(
        currentStoryId as (typeof SLIDEDOC_SEQUENCE)[number],
      )
    : -1;
  const showDeckCounter = isPresentation && currentDeckIndex >= 0;
  const displayTotal = Math.max(total, 1);
  const displayCurrent = total ? current + 1 : 1;
  const isFirstSlide = current <= 0;
  const isLastSlide = total > 0 ? current >= total - 1 : true;
  const atStart = isFirstSlide && !hasPrevDeck;
  const atEnd = isLastSlide && !hasNextDeck;

  return (
    <div data-slideshow-mode={isPresentation ? "present" : "docs"}>
      <div ref={containerRef}>{children}</div>

      {(total > 1 || isPresentation) && (
        <div
          data-slideshow-nav
          style={nav}
          role="navigation"
          aria-label="Slide navigation"
        >
          <button
            style={atStart ? btnDisabled : btn}
            disabled={atStart}
            onClick={() => goTo(currentRef.current - 1)}
            title="Previous slide (← ↑ PageUp)"
          >
            ←
          </button>

          <span style={counter}>
            {showDeckCounter
              ? `${currentDeckIndex + 1}/${SLIDEDOC_SEQUENCE.length} · ${displayCurrent}/${displayTotal}`
              : `${displayCurrent} / ${displayTotal}`}
          </span>

          <button
            style={atEnd ? btnDisabled : btn}
            disabled={atEnd}
            onClick={() => goTo(currentRef.current + 1)}
            title="Next slide (→ ↓ PageDown)"
          >
            →
          </button>

          <span style={sep}>|</span>

          {isPresentation ? (
            <button style={btn} onClick={openDocs} title="Return to docs view">
              ↩ docs
            </button>
          ) : (
            <button
              style={btn}
              onClick={openPresent}
              title="Open in presentation mode (one visual per slide)"
            >
              ⛶ present
            </button>
          )}

          <button
            style={btn}
            onClick={() => window.print()}
            title="Print or export as PDF"
          >
            ⎙ pdf
          </button>
        </div>
      )}
    </div>
  );
}
