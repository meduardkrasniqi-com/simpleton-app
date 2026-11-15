const query = () => window.matchMedia("(prefers-color-scheme: dark)");

export const isDark = () => query().matches;

export function onSchemeChange(listener: (dark: boolean) => void) {
  const media = query();
  const handler = (e: MediaQueryListEvent) => listener(e.matches);
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}
