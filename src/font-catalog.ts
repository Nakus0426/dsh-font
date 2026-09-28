import { readdir } from "node:fs/promises";
import path from "node:path";
import * as fontkit from "fontkit";
import type { FontRecord } from "./font-utils.js";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".otc"]);
const WEIGHT_FALLBACK = 400;

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function namesFromRecord(record: unknown): string[] {
  if (!record || typeof record !== "object") return [];
  return Object.values(record as Record<string, unknown>)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string")
    .map(normalize)
    .filter(Boolean);
}

/**
 * Read one locale's bucket from a name record.
 *
 * fontkit groups name records by locale key (`en`, `zh`, `zh-SG`, `0-0`), so a
 * whole-record read is locale-ordered and unstable across fonts.
 */
function localeNames(record: unknown, locale: string): string[] {
  if (!record || typeof record !== "object") return [];
  const bucket = (record as Record<string, unknown>)[locale];
  if (Array.isArray(bucket)) {
    return bucket
      .filter((value): value is string => typeof value === "string")
      .map(normalize)
      .filter(Boolean);
  }
  return typeof bucket === "string" ? [normalize(bucket)].filter(Boolean) : [];
}

function faceRecords(parsed: any): any[] {
  return Array.isArray(parsed?.fonts) && parsed.fonts.length > 0 ? parsed.fonts : [parsed];
}

/**
 * Resolve the family name to put in CSS.
 *
 * The ASCII name is authoritative: `font-family` matches localized names
 * inconsistently, and a Chinese UI would otherwise emit a Chinese family value.
 * Localized names stay available as search aliases.
 */
function familyFromFace(face: any): string {
  const records = face?.name?.records;
  return (
    localeNames(records?.preferredFamily, "en")[0] ??
    localeNames(records?.fontFamily, "en")[0] ??
    normalize(face?.familyName ?? "")
  );
}

function aliasesFromFace(face: any, family: string): string[] {
  const records = face?.name?.records ?? {};
  const aliases = [
    ...namesFromRecord(records.fontFamily),
    ...namesFromRecord(records.preferredFamily),
    ...namesFromRecord(records.fullName),
  ];
  return [...new Set(aliases.filter((name) => name !== family))];
}

export function addFontFile(groups: Map<string, FontRecord>, filePath: string): void {
  const parsed = fontkit.openSync(filePath) as any;
  for (const face of faceRecords(parsed)) {
    const family = familyFromFace(face);
    if (!family) continue;
    const current = groups.get(family) ?? { family, aliases: [], fixed: false, weights: [] };
    current.aliases = [...new Set([...current.aliases, ...aliasesFromFace(face, family)])];
    current.fixed ||= Boolean(face?.post?.isFixedPitch);
    const weight = Number(face?.["OS/2"]?.usWeightClass) || WEIGHT_FALLBACK;
    if (!current.weights.includes(weight)) current.weights.push(weight);
    groups.set(family, current);
  }
}

async function filesInDirectory(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter(
        (entry) => entry.isFile() && FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
      )
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

export async function scanFonts(): Promise<FontRecord[]> {
  const roots = [
    path.join(process.env.SystemRoot ?? "C:\\Windows", "Fonts"),
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Windows", "Fonts"),
  ];
  const files = [...new Set((await Promise.all(roots.map(filesInDirectory))).flat())];
  const groups = new Map<string, FontRecord>();
  for (const file of files) {
    try {
      addFontFile(groups, file);
    } catch {
      /* ignore unreadable or malformed files */
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.family.localeCompare(b.family, undefined, { sensitivity: "base" }),
  );
}

let catalogPromise: Promise<FontRecord[]> | undefined;
export function getCatalog(): Promise<FontRecord[]> {
  return (catalogPromise ??= scanFonts());
}

export function resetCatalogForTests(): void {
  catalogPromise = undefined;
}
