import type { Options } from "tsdown";

const config: Options = {
  entry: ["src/client.tsx"],
  format: ["cjs"],
  outDir: "lib",
  dts: false,
  clean: false,
  sourcemap: false,
  external: ["react", "react/jsx-runtime", "react-dom", "@deepseek-ai/cordis"],
  outExtensions: () => ({ js: ".js" }),
  banner: `window.__ModuleLoader__.load({ id: "dsh-font", factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  footer: `return module.exports; }});`,
};

export default config;
