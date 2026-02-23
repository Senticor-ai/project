import { useState, useEffect, useCallback } from "react";
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
    // Fix up the URL synchronously during init if it was incomplete
    const canonical = buildPath(parsed.view, parsed.sub);
    if (window.location.pathname !== canonical) {
      const suffix = `${window.location.search}${window.location.hash}`;
      window.history.replaceState({}, "", `${canonical}${suffix}`);
    }
    return parsed;
  });

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
