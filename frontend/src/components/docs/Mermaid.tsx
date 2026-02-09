import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  fontFamily: "system-ui, sans-serif",
  flowchart: { useMaxWidth: true, htmlLabels: true },
});

let counter = 0;

interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = `mermaid-${++counter}`;
    let cancelled = false;

    mermaid.render(id, chart).then(
      ({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      },
      (err) => {
        if (!cancelled) setError(String(err));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <pre style={{ color: "red", padding: "1rem" }}>
        Mermaid error: {error}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", justifyContent: "center", margin: "2rem 0" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
