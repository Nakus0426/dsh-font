export type FontRecord = {
  family: string;
  aliases: string[];
  fixed: boolean;
  weights: number[];
};

export function searchFonts(fonts: FontRecord[], query: string): FontRecord[] {
  const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!needle) return fonts;
  return fonts.filter((font) =>
    [font.family, ...font.aliases].some((name) => name.toLocaleLowerCase().includes(needle)),
  );
}

export function sortFonts(fonts: FontRecord[], locale: string): FontRecord[] {
  return [...fonts].sort((a, b) => {
    const fixedOrder = Number(b.fixed) - Number(a.fixed);
    return fixedOrder || a.family.localeCompare(b.family, locale, { sensitivity: "base" });
  });
}

export function cssFamilyValue(family: string, fallback: string): string {
  const escaped = family.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}", ${fallback}`;
}

export const DEFAULT_UI_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
export const DEFAULT_CODE_STACK =
  '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace';
