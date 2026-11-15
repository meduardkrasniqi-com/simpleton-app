import { createContext, useContext } from "react";

export type FileLinks = { resolve: (text: string) => string | null; open: (path: string) => void };

export const FileLinksContext = createContext<FileLinks | null>(null);

export const useFileLinks = () => useContext(FileLinksContext);

export function resolver(root: string, files: string[]) {
  const known = new Set(files);
  const byName = new Map<string, string | null>();
  for (const path of files) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    byName.set(name, byName.has(name) ? null : path);
  }
  const prefix = root.endsWith("/") ? root : `${root}/`;

  return (text: string) => {
    let path = text
      .trim()
      .replace(/^[`'"(<[]+|[`'")>\],.;:!?]+$/g, "")
      .replace(/#L\d+(-L?\d+)?$/, "")
      .replace(/:\d+(:\d+)?(-\d+)?$/, "")
      .replace(/^\.\//, "");
    if (!path || /\s/.test(path)) return null;
    if (path.startsWith(prefix)) path = path.slice(prefix.length);
    if (known.has(path)) return path;
    if (path.startsWith("/")) return null;
    if (!path.includes("/")) return byName.get(path) ?? null;
    const matches = files.filter((f) => f.endsWith(`/${path}`));
    return matches.length === 1 ? matches[0] : null;
  };
}
