import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { scanFonts } from "../src/font-catalog.ts";

const fontDirs = [
  join(process.env.SystemRoot ?? "C:\\Windows", "Fonts"),
  join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Windows", "Fonts"),
];
const available = fontDirs.some((dir) => dir !== "" && existsSync(dir));

/** True when every code point in the value is ASCII. */
function isAscii(value) {
  return [...value].every((char) => char.codePointAt(0) <= 0x7f);
}

test(
  "scan yields one row per real CSS family",
  { skip: available ? false : "no Windows font directory on this machine" },
  async () => {
    const fonts = await scanFonts();
    assert.ok(fonts.length > 0, "expected at least one font family");

    const families = fonts.map((font) => font.family);
    assert.equal(
      new Set(families).size,
      families.length,
      "families must be unique because they are the picker keys",
    );

    // A weight must never masquerade as its own family: that is exactly the
    // registry-name failure this scan exists to avoid. Families that legitimately
    // contain style words ("Cooper Black", "Arial Rounded MT Bold") stay valid.
    for (const weightOnly of [
      "Arial Bold",
      "Arial Italic",
      "Consolas Bold",
      "Consolas Bold Italic",
    ]) {
      assert.ok(
        !families.includes(weightOnly),
        `${weightOnly} is a weight of another family and must not be its own row`,
      );
    }
    assert.ok(
      families.every((family) => !/\((?:TrueType|OpenType|All res|\d+)\)\s*$/.test(family)),
      "families must not keep the registry file-type suffix",
    );

    assert.ok(
      fonts.every((font) => font.family.trim() !== ""),
      "every row needs a non-empty family",
    );
    assert.ok(
      fonts.every((font) => font.weights.length > 0),
      "every row needs at least one weight",
    );
  },
);

test(
  "known Windows families resolve to their real names",
  { skip: available ? false : "no Windows font directory on this machine" },
  async () => {
    const families = new Set((await scanFonts()).map((font) => font.family));
    for (const expected of ["Arial", "Consolas"]) {
      assert.ok(families.has(expected), `expected family ${expected} in the catalog`);
    }
  },
);

test(
  "CSS family values stay ASCII while localized names remain searchable",
  { skip: available ? false : "no Windows font directory on this machine" },
  async () => {
    const fonts = await scanFonts();

    // `font-family` matches localized names inconsistently, so the CSS value must
    // be the ASCII name even on a Chinese system.
    const localized = fonts.filter((font) => !isAscii(font.family));
    assert.deepEqual(
      localized.map((font) => font.family),
      [],
      "CSS family values must be ASCII",
    );

    // The localized name must still be reachable, or Chinese users cannot find the font.
    const cjk = fonts.find(
      (font) => font.family === "Microsoft JhengHei" || font.family === "Microsoft YaHei",
    );
    assert.ok(cjk !== undefined, "expected a CJK family on this machine");
    assert.ok(
      cjk.aliases.some((alias) => !isAscii(alias)),
      `${cjk.family} should keep its localized name as a search alias`,
    );
  },
);
