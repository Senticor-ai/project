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
  "disclaimer.dev.title": {
    en: "Dev/Demo Environment",
    de: "Entwicklungs-/Demo-Umgebung",
  },
  "disclaimer.dev.banner": {
    en: "This is a development/demonstration environment. No SLA, warranties, backups, or data privacy guarantees apply.",
    de: "Dies ist eine Entwicklungs-/Demonstrationsumgebung. Keine SLA, Garantien, Backups oder Datenschutzgarantien.",
  },
  "disclaimer.dev.modal.title": {
    en: "Important Notice: Dev/Demo Environment",
    de: "Wichtiger Hinweis: Entwicklungs-/Demo-Umgebung",
  },
  "disclaimer.dev.modal.intro": {
    en: "Before you continue, please note:",
    de: "Bevor Sie fortfahren, beachten Sie bitte:",
  },
  "disclaimer.dev.modal.point1": {
    en: "This system is for development and demonstration purposes only",
    de: "Dieses System dient nur zu Entwicklungs- und Demonstrationszwecken",
  },
  "disclaimer.dev.modal.point2": {
    en: "No service level agreements (SLA) or warranties apply",
    de: "Es gelten keine Service-Level-Agreements (SLA) oder Garantien",
  },
  "disclaimer.dev.modal.point3": {
    en: "No backup guarantees — data may be lost at any time",
    de: "Keine Backup-Garantien — Daten können jederzeit verloren gehen",
  },
  "disclaimer.dev.modal.point4": {
    en: "No data privacy guarantees — do not use real or sensitive data",
    de: "Keine Datenschutzgarantien — verwenden Sie keine echten oder sensiblen Daten",
  },
  "disclaimer.dev.modal.acknowledge": {
    en: "I understand",
    de: "Ich verstehe",
  },
};

export function getMessage(key: string, locale?: string): string {
  const lang = (locale ?? navigator.language).startsWith("de") ? "de" : "en";
  return messages[key]?.[lang] ?? key;
}
