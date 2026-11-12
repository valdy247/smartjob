import messages from "./i18n/messages.json";

export type InterfaceLanguage = "es" | "en";
export type MessageKey = keyof typeof messages.es;
export const INTERFACE_LANGUAGE_KEY = "vmv_ui_language";
export const INTERFACE_LANGUAGE_METADATA_KEY = "ui_language";

export function interfaceLanguage(value: unknown): InterfaceLanguage | null {
  return value === "es" || value === "en" ? value : null;
}

export function visitorLanguage(stored: unknown, deviceLanguage: string | null | undefined): InterfaceLanguage {
  const selected = interfaceLanguage(stored);
  if (selected) return selected;
  return /^es(?:[-_]|$)/i.test(deviceLanguage || "") ? "es" : "en";
}

export function accountLanguage(metadata: Record<string, unknown> | null | undefined): InterfaceLanguage | null {
  return interfaceLanguage(metadata?.[INTERFACE_LANGUAGE_METADATA_KEY]);
}

export function t(language: InterfaceLanguage, key: MessageKey, values?: Record<string, string | number>): string {
  const template: string = messages[language][key];
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) =>
    values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
}

export function formatInterfaceDate(language: InterfaceLanguage, date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", options).format(typeof date === "string" ? new Date(date) : date);
}

export function formatInterfaceNumber(language: InterfaceLanguage, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(language === "es" ? "es-US" : "en-US", options).format(value);
}

// Keep the currency and amount supplied by billing: this changes presentation only.
export function formatInterfaceCurrency(language: InterfaceLanguage, value: number, currency: string): string {
  return formatInterfaceNumber(language, value, {style: "currency", currency});
}
