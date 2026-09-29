import { readFileSync } from "node:fs";
import type { Options } from "tsdown";

/**
 * The npm package name, which is also the id the browser bundle must register.
 *
 * `@deepseek-ai/dsh-client-modules` keys its boot graph rows by the resolved
 * package name (`reconcilePackage` → `graphRow(packageName, …)`) and its
 * `arrive()` accepts a bundle only when it registered exactly that id. Deriving
 * the banner id from the manifest keeps the two from drifting apart: with a
 * mismatch the loader treats the bundle as "loaded without registering", retries
 * it on the one-resource URL — re-executing the script, which throws
 * `duplicate factory registration` — and the entry never activates, so the whole
 * web boot fails (`web boot: 1 entry did not activate`).
 *
 * The id is deliberately NOT the cordis row id (`dsh-font` in
 * `cordis.patch.yml`): rows are addressed by package name.
 */
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  name: string;
};

const config: Options = {
  entry: ["src/client.tsx"],
  format: ["cjs"],
  outDir: "lib",
  dts: false,
  clean: false,
  sourcemap: false,
  external: ["react", "react/jsx-runtime", "react-dom", "@deepseek-ai/cordis"],
  outExtensions: () => ({ js: ".js" }),
  banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  footer: `return module.exports; }});`,
};

export default config;
