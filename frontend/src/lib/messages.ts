/**
 * Lightweight i18n message lookup (en/de).
 * Trivially replaceable with ICU MessageFormat when a full i18n system is needed.
 */

const messages: Record<string, { en: string; de: string }> = {
  "conflict.itemModified.title": { en: "Conflict", de: "Konflikt" },
  "conflict.itemModified.description": {
    en: "This item was modified elsewhere. Reloading latest version.",
    de: "Dieser Eintrag wurde anderweitig geändert. Aktuelle Version wird geladen.",
  },
  "error.rateLimited.title": {
    en: "Too many requests",
    de: "Zu viele Anfragen",
  },
  "error.rateLimited.description": {
    en: "Please wait a moment before trying again.",
    de: "Bitte warte einen Moment, bevor du es erneut versuchst.",
  },
  "pwa.updateAvailable.title": {
    en: "Update available",
    de: "Aktualisierung verfügbar",
  },
  "pwa.updateAvailable.description": {
    en: "A new version is available.",
    de: "Eine neue Version ist verfügbar.",
  },
  "pwa.updateAvailable.reload": { en: "Reload", de: "Neu laden" },
  "pwa.installPrompt.title": {
    en: "Install app",
    de: "App installieren",
  },
  "pwa.installPrompt.description": {
    en: "Install for offline access and a native experience.",
    de: "Für Offline-Zugriff und ein natives Erlebnis installieren.",
  },
};

export function getMessage(key: string, locale?: string): string {
  const lang = (locale ?? navigator.language).startsWith("de") ? "de" : "en";
  return messages[key]?.[lang] ?? key;
}
