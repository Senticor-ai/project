import { useState, useEffect, useCallback, useRef } from "react";
import {
  parsePathname,
  buildPath,
  type AppView,
  type LocationState,
} from "@/lib/route-utils";

export interface UseLocationStateReturn {
  location: LocationState;
  navigate: (view: AppView, sub: string) => void;
}

export function useLocationState(): UseLocationStateReturn {
  const [location, setLocation] = useState<LocationState>(() => {
    const parsed = parsePathname(window.location.pathname);
    return parsed;
  });

  // On mount, fix up the URL if it was incomplete (e.g. "/" or "/workspace")
  const didFixup = useRef(false);
  if (!didFixup.current) {
    didFixup.current = true;
    const canonical = buildPath(location.view, location.sub);
    if (window.location.pathname !== canonical) {
      window.history.replaceState({}, "", canonical);
    }
  }

  const navigate = useCallback((view: AppView, sub: string) => {
    const path = buildPath(view, sub);
    window.history.pushState({}, "", path);
    setLocation({ view, sub });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setLocation(parsePathname(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return { location, navigate };
}
