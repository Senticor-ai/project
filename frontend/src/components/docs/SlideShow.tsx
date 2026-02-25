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

interface SlideShowProps {
  children: ReactNode;
}

export function SlideShow({ children }: SlideShowProps) {
  const containerNode = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef(0);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);

  // Callback ref: reads the DOM once on mount to count slides.
  // Avoids calling setState inside a useEffect body.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerNode.current = node;
    if (node) {
      setTotal(getSlidesIn(node).length);
    }
  }, []);

  const goTo = useCallback((index: number) => {
    const slides = getSlidesIn(containerNode.current);
    if (!slides.length) return;
    const target = Math.max(0, Math.min(index, slides.length - 1));
    currentRef.current = target;
    setCurrent(target);
    slides[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
      const baseHref = isInIframe
        ? window.parent.location.href
        : window.location.href;
      const url = new URL(baseHref);
      url.searchParams.set("full", "1");
      window.open(url.toString(), "_blank");
    } catch {
      // cross-origin parent — silently ignore
    }
  };

  if (total <= 1) {
    return <div ref={containerRef}>{children}</div>;
  }

  return (
    <div>
      <div ref={containerRef}>{children}</div>

      {/* Floating navigation — hidden in print via [data-slideshow-nav] selector */}
      <div
        data-slideshow-nav
        style={nav}
        role="navigation"
        aria-label="Slide navigation"
      >
        <button
          style={current === 0 ? btnDisabled : btn}
          disabled={current === 0}
          onClick={() => goTo(currentRef.current - 1)}
          title="Previous slide (← ↑ PageUp)"
        >
          ←
        </button>

        <span style={counter}>
          {current + 1} / {total}
        </span>

        <button
          style={current === total - 1 ? btnDisabled : btn}
          disabled={current === total - 1}
          onClick={() => goTo(currentRef.current + 1)}
          title="Next slide (→ ↓ PageDown)"
        >
          →
        </button>

        <span style={sep}>|</span>

        <button
          style={btn}
          onClick={openPresent}
          title="Open in presentation mode (hides Storybook panels)"
        >
          ⛶ present
        </button>

        <button
          style={btn}
          onClick={() => window.print()}
          title="Print or export as PDF"
        >
          ⎙ pdf
        </button>
      </div>
    </div>
  );
}
