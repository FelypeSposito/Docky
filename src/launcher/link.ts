/** Endings that make "site.com" read as a site rather than a file name like "notas.txt". */
const SITE_ENDINGS = new Set(["com", "br", "net", "org", "io", "dev", "app", "gg", "tv", "me", "co", "ai", "so", "xyz", "edu", "gov", "info", "pt", "us", "uk", "de", "fm", "ly", "to", "sh"]);

/**
 * A link typed or pasted in a search field, as a full URL, or null. Accepts "https://site.com/page" and also a bare
 * "site.com" or "www.site.com.br/x" when it ends like a site.
 */
export function linkFrom(text: string): string | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  let candidate: string;
  if (/^https?:\/\//i.test(value)) candidate = value;
  else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value)) candidate = `https://${value}`;
  else return null;
  try {
    const url = new URL(candidate);
    const parts = url.hostname.split(".");
    if (parts.length < 2) return null;
    if (!/^https?:\/\//i.test(value) && !SITE_ENDINGS.has(parts[parts.length - 1].toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The host to show ("youtube.com"), without "www.". */
export const siteHost = (url: string): string => new URL(url).hostname.replace(/^www\./, "");

/** A shortcut name for a site: "https://www.youtube.com/x" → "Youtube", "web.whatsapp.com" → "Whatsapp". */
export function siteName(url: string): string {
  const parts = siteHost(url).split(".");
  const generic = new Set(["web", "app", "m", "mail", "docs", "drive"]);
  const base = parts.length > 2 && generic.has(parts[0]) ? parts[1] : parts[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}
