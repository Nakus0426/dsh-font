# DSH third-party plugin authoring: verified contract report

Source of truth: read-only extraction at `D:\dsh-asar-ref\dsh`. Paths below are abbreviated:
- `ROOT` = `D:\dsh-asar-ref\dsh`
- `PKG(x)` = `ROOT\node_modules\@deepseek-ai\x`
- `FE` = `ROOT\node_modules\@deepseek-ai\dsh-web-frontend\dist\assets\index-Q6zc2uHV.js` (minified; "line 126" plus a character offset is given where exactness matters)
- live profile = `C:\Users\82077\.dsh\profiles\web`

DSH version everywhere: **0.1.7-rc.2**. `@deepseek-ai/cordis` **4.0.4**. `@deepseek-ai/schemastery` **3.18.4**.

---

## 1. The `window.__ModuleLoader__.load` contract

### 1.1 Who owns it

`@deepseek-ai/dsh-client-modules` (id `@deepseek-ai/dsh-client-modules`, the constant `CLIENT_MODULES_ID`, `PKG(dsh-client-modules)\lib\index.js:439`). It is a **dual-face** package: the Node half composes the boot graph and serves bundles; the browser half (`lib/client.js`) is the module system itself. It is the first parser-blocking bootstrap script (`PARSER_PRELOAD_IDS = [CLIENT_MODULES_ID]`, `index.js:441`).

### 1.2 The HTML-installed facade (the queue)

Injected into `<head>` before anything else, from `PKG(dsh-client-modules)\lib\index.js:454-475`:

```js
const queue = `(()=>{
const pendingQueue=[]
window.__ModuleLoader__={
  mode:"queue",
  pendingQueue,
  load(registration){pendingQueue.push(registration)},
  create(options){
    if(this.mode!=="queue")throw new Error("client-modules: window.__ModuleLoader__.create called after module-system boot")
    const index=pendingQueue.findIndex(registration=>registration.id===${JSON.stringify(CLIENT_MODULES_ID)})
    const registration=pendingQueue[index]
    if(registration===undefined)throw new Error("client-modules: HTML did not preload @deepseek-ai/dsh-client-modules/client.js")
    pendingQueue.splice(index,1)
    const exports=registration.factory(specifier=>{
      throw new Error('client-modules: @deepseek-ai/dsh-client-modules/client.js requested external "'+specifier+'" before the module system existed')
    })
    if(typeof exports!=="object"||exports===null||typeof exports.createClientModuleSystem!=="function"||typeof exports.apply!=="function"){
      throw new Error("client-modules: @deepseek-ai/dsh-client-modules/client.js did not export the bootstrap module face")
    }
    return exports.createClientModuleSystem(this,{id:registration.id,exports},options)
  }
}
})()`;
```

So the **only** callable before the shell boots is:

| member | signature | meaning |
|---|---|---|
| `load(registration)` | `(registration: { id: string, factory: (require) => any, chunk?: string }) => void` | Push one registration. In `mode:"queue"` it buffers; after boot it registers live. |
| `create(options)` | `(options: { boot, staticModules, loadBundle? }) => ClientModuleSystem` | Called **once** by the shell. Throws if called twice. |
| `mode` | `"queue"` → `"live"` | Flipped by the `ClientModuleSystem` constructor (`client.js:562`). |
| `pendingQueue` | `registration[]` | Drains into `register()` at construction (`client.js:561-566`). |

### 1.3 The shell's call site

`FE` line 126, char ≈ 625 560 (the `XS` boot class):

```js
const o=n.__ModuleLoader__;
if(o===void 0)throw new Error("web boot: window.__ModuleLoader__ bootstrap facade is missing");
const s=globalThis.__DSH_TRANSPORT__;
this.modules=o.create({boot:n.__DSH_BOOT__,staticModules:WS(),
  ...s?.loadBundle===void 0?{}:{loadBundle:s.loadBundle},...this.seams})
```

and the loader is wired in `HS` (char ≈ 621 634):

```js
async function HS(e){const{ctx:n,manifest:o,onEntryState:s}=e;await n.plugin(cf);const a=n.loader;
  a.internal=e.modules;                       // <-- the module system becomes the cordis Loader's import face
  n.on("internal/status",...);
  const u=o.plugins.map(f=>f.id);
  for(const f of u)s?.(f,"loading");
  await e.modules.entries.start(a,o);
  ...}
```

`createClientModuleSystem` (`client.js:850-858`):

```js
function createClientModuleSystem(target, bootstrapModule, options) {
  return new ClientModuleSystem({
    manifest: parseBootManifest(options.boot),
    staticModules: options.staticModules,
    registrationTarget: target,
    bootstrapModule,
    ...options.loadBundle === void 0 ? {} : { loadBundle: options.loadBundle }
  });
}
```

### 1.4 Registration validation (`client.js:568-581`)

```js
register(registration) {
  const ownerId = stripClientSuffix(registration.id);
  if (registration.chunk !== void 0 && !CLIENT_CHUNK.test(registration.chunk)) throw new Error(`client-modules: invalid package-local chunk ${JSON.stringify(registration.chunk)}`);
  const id = registration.chunk === void 0 ? ownerId : chunkId(ownerId, registration.chunk);
  if (this.bootstrapIds.has(id) || this.factories.has(id)) {
    const registrationName = registration.chunk === void 0 ? registration.id : id;
    throw new Error(`client-modules: duplicate factory registration for "${registrationName}" (bundle executed twice without invalidate?)`);
  }
  this.factories.set(id, {
    factory: registration.factory,
    rev: this.reloadTargets.get(ownerId)?.rev ?? this.graphRows.get(ownerId)?.rev
  });
}
```

- `stripClientSuffix` (`client.js:98-100`) removes a trailing `/client`, so `<pkg>/client` and `<pkg>` are the same module.
- `CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` (`client.js:470`); the internal chunk id is `` `${ownerId}/${fileName}` `` (`chunkId`, `client.js:476-478`).
- **A duplicate registration throws.** A bundle must be executed exactly once per generation.

### 1.5 The loader is a classic script — the wrapper is MANDATORY

`client.js:450-464`:

```js
/** Default bundle-load hook: same-origin external classic script. */
const defaultLoadBundle = (url) => new Promise((resolve, reject) => {
  const el = document.createElement("script");
  el.async = true;
  el.src = url;                       // NOTE: no type="module"
  el.addEventListener("load", () => { el.remove(); resolve(); }, { once: true });
  el.addEventListener("error", () => { el.remove(); reject(new Error(`client-modules: bundle script ${url} failed to load`)); }, { once: true });
  document.head.append(el);
});
```

A plain ES module is **not** accepted: `import`/`export` in a classic script is a syntax error, and even if it parsed, the loader requires the registration side effect. `arrive()` (`client.js:610-642`) enforces this:

```js
if (this.factories.has(id)) return "registered";
failures.push(`${url}: loaded without registering "${id}" via __ModuleLoader__.load`);
```

and the top-of-bundle contract is documented at `client.js:15-18`:

```
* Lazy CJS model: executing a plugin bundle only REGISTERS its
* factory (`window.__ModuleLoader__.load({id, factory})`); every module body
* side effect — including CSS injection — lives inside the factory closure and
* runs at materialization, not at script execution.
```

**Canonical shape (every one of the 83 shipped bundles starts this way):**

```js
window.__ModuleLoader__.load({
  id: "@scope/pkg-name",              // MUST equal the package.json "name", or "<name>/client"
  factory: (require) => {             // factory(require) -> exports; memoized at first materialization
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    // ... module body; top-level statements here run at MATERIALIZATION
    exports.apply = function apply(ctx) { /* cordis plugin */ };
    return module.exports;            // REQUIRED
  }
});
```

Package-local code-split chunk registers with `chunk`:

```js
window.__ModuleLoader__.load({
  id: "@scope/pkg-name",
  chunk: "client.terminal.js",       // must match /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/
  factory: (require) => { ... return module.exports; }
});
```
(real examples: `PKG(dsh-client-ui-sidebar-terminal)\lib\client.terminal.js:1`, `PKG(dsh-client-ui-sidebar-documentpreview)\lib\client.pdf.js:944`, `...\lib\client.excel.js:312`.) Load them with `require.async("./client.terminal.js")`.

### 1.6 What `require` resolves — and what it refuses

`makeRequire` (`client.js:696-715`):

```js
makeRequire(ownerId, edges) {
  const require = (spec) => {
    edges.add(spec);
    if (this.seed.has(spec)) return this.seed.get(spec);
    const id = stripClientSuffix(spec);
    const record = this.loadCache.get(id);
    if (record !== void 0) return record.exports;
    if (this.factories.has(id)) return this.materialize(id).exports;
    throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`);
  };
  require.async = async (spec) => {
    edges.add(spec);
    if (!spec.startsWith("./")) return await this.import(spec);
    const fileName = spec.slice(2);
    if (!CLIENT_CHUNK.test(fileName)) throw new Error(`client-modules: invalid relative chunk request ${JSON.stringify(spec)}`);
    return await this.importChunk(ownerId, fileName);
  };
  return require;
}
```

Resolution branch order (`import`, `client.js:743-757`): **seed table → memoized record → boot-graph row (arriving its declared `external`/`inject` first) → registered factory → throw.**

Consequences for an author:
- **Bare specifiers only** — from the seed table, from another boot-graph row, or from your own registered factory. No `node_modules` lookup, no import map, no relative `./foo.js` module resolution.
- **Relative paths are reserved**: `require("./x")` throws; only `require.async("./client.<name>.js")` is legal.
- **Cycles are fatal** (`client.js:677`): *"require cycle through "id" (factory-form CJS cannot deliver partial exports)"*.
- Externals are frozen at boot: the whole graph is composed on the Host before the page runs.

### 1.7 How the loader discovers client entries — from `package.json` `dsh.client`

Not from a manifest file, not from a runtime registry. The Node half scans the **live cordis Loader entries** and reads each row's resolved `package.json`. `resolveMeta` (`index.js:701-731`):

```js
resolveMeta(loaderName, baseUrl) {
  const sourceKey = this.sourceKey(loaderName, baseUrl);
  const cached = this.pkgMeta.get(sourceKey);
  if (cached !== void 0) return cached;
  const located = this.locatePkgJson(loaderName, baseUrl);
  if (located === void 0) { this.pkgMeta.set(sourceKey, null); return null; }
  const { packageName, path: pkgPath } = located;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const dsh = pkg.dsh;
  const decl = parseDshClient(packageName, dsh !== null && typeof dsh === "object" ? dsh.client : void 0);
  if (decl === void 0 || decl.platform !== "web") { this.pkgMeta.set(sourceKey, null); return null; }
  const clientRel = clientExportOf(packageName, pkg.exports);
  if (clientRel === void 0) throw new Error(`client-modules: ${packageName} declares dsh.client but exports no "./client" bundle`);
  const resolved = {
    packageName,
    meta: {
      clientPath: join(dirname(pkgPath), clientRel),
      ...decl.inject !== void 0 ? { inject: decl.inject } : {},
      external: decl.external ?? [],
      immediately: decl.immediately === true
    }
  };
  this.pkgMeta.set(sourceKey, resolved);
  return resolved;
}
```

`clientExportOf` (`index.js:171-181`) accepts `exports["./client"]` as a string or `{ default: string }`.

The `dsh.client` validator, shared by host and browser (`\lib\index.js:61-75` / `\lib\client.js:61-75`):

```js
function parseDshClient(pkgName, value) {
  if (value === void 0) return void 0;
  if (typeof value !== "object" || value === null) throw new Error(`client-modules: ${pkgName} has a non-object dsh.client declaration`);
  const decl = value;
  if (typeof decl.platform !== "string") throw new Error(`client-modules: ${pkgName} dsh.client.platform must be a string`);
  const inject = optionalStringArray(pkgName, "dsh.client.inject", decl.inject);
  const external = optionalStringArray(pkgName, "dsh.client.external", decl.external);
  if (decl.immediately !== void 0 && typeof decl.immediately !== "boolean") throw new Error(`client-modules: ${pkgName} dsh.client.immediately must be a boolean`);
  return { platform: decl.platform, ...inject !== void 0 ? { inject } : {},
           ...external !== void 0 ? { external } : {},
           ...decl.immediately !== void 0 ? { immediately: decl.immediately } : {} };
}
```

**`platform` must be exactly `"web"`**; anything else silently makes the package a non-client package.

**The built file must already exist at activation.** `initialBundleSnapshot` (`index.js:811-822`) throws `MissingClientBundleError` on `ENOENT`, and the grouped message is (README line 50): *"The host serves built client bundles, so `pnpm run build` must have produced each `lib/client.js` before launch; a missing bundle fails activation loudly with one build instruction and a package/path list."*

**Name uniqueness.** `dsh-client-modules\README.md:72`: *"Distinct active Loader sources resolving to one package name are rejected; removing the conflict promotes the remaining source without requiring its fiber to restart."*

**What the boot graph row carries** (`index.js:395-403` + `client.js:128-139`): `{ id, url, rev, inject, external, immediately }` — `inject` and `external` are strings arrays; `immediately: true` puts the row in the eagerly prefetched tier (`FE`: `this.manifest.plugins.filter(e=>e.immediately).map(e=>this.modules.prefetch(e.id))`).

---

## 2. Shared modules: the frozen seed table

### 2.1 The registry is a **fixed, shell-owned, 9-entry table** — declared in the shell bundle, not in YAML

`FE` char 624 231, line 126:

```js
function WS(){return{
  react:yf,
  "react/jsx-runtime":jf,
  "react-dom":Lf,
  "react-dom/client":Tf,
  "@deepseek-ai/cordis":Jd,
  "@deepseek-ai/dsh-client-store":th,
  "@deepseek-ai/dsh-client-ui-slots":lh,
  "@deepseek-ai/dsh-client-ui-primitives":qb,
  "@deepseek-ai/dsh-client-ui-dockkit":FS}}
```

`WS()` is passed as `staticModules` and becomes `this.seed` (`client.js:548`): `this.seed = new Map(Object.entries(options.staticModules));`

`dsh-client-modules\README.md:46`: *"The shell seeds a frozen module table (`PLATFORM_MODULES`: React, Cordis, and static UI libraries); every dynamic bundle resolves its externals against exactly that baseline. `dsh.client.external` adds only exact non-baseline requests, each answered by the dynamic package row it names or an exact static-table key."*

### 2.2 Empirically complete list of `require()` specifiers in all 84 shipped client bundles

I extracted every `require("…")` from every `lib/client*.js` under `ROOT\node_modules\@deepseek-ai\**`:

| specifier | count | resolvable how |
|---|---|---|
| `react` | 52 | seed |
| `react/jsx-runtime` | 54 | seed |
| `react-dom` | 14 | seed |
| `react-dom/client` | 1 | seed |
| `@deepseek-ai/cordis` | 20 | seed |
| `@deepseek-ai/dsh-client-store` | 39 | seed |
| `@deepseek-ai/dsh-client-ui-primitives` | 52 | seed |
| `@deepseek-ai/dsh-client-ui-slots` | 7 | seed |
| `@deepseek-ai/dsh-client-ui-dockkit` | 1 | seed (used by `PKG(dsh-client-ui-sidebar-right)\lib\client.js`) |
| `@deepseek-ai/dsh-api-gateway/client` | 5 | **not** a seed → declared in `dsh.client.external` by each consumer, answered by the `@deepseek-ai/dsh-api-gateway` boot-graph row (a `dsh.client` package) |
| `url`, `util` | 2 | **dead code only** — vendored Node branches: lodash `nodeUtil` in `PKG(dsh-client-ui-sidebar-documentpreview)\lib\client.excel.js` char 37 728, and pdf.js `NodeCanvasFactory` in `...\lib\client.pdf.js` char 331 191. Both are unreachable in the browser. |

### 2.3 Answers to the specific questions

- `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client` → **seed. Resolvable, never bundle them.**
- `@deepseek-ai/dsh-client-ui-primitives` → **seed.** It is a pure library (`PKG(dsh-client-ui-primitives)\package.json` has **no** `dsh` field at all, no `./client` export; `lib/index.js` is host-style ESM importing `react/jsx-runtime`; its CSS ships as `lib/*.module.css`). The shell bundles it (`qb`).
- `@deepseek-ai/dsh-client-ui-slots` → **seed** (`lh`).
- `@deepseek-ai/dsh-client-store` → **seed** (`th`).
- `@deepseek-ai/cordis` → **seed** (`Jd`). Yes — the browser half of the Cordis service base class is available to a client plugin.
- `@deepseek-ai/dsh-client-runtime` → **does not exist** in this distribution. There is no such package.
- `@deepseek-ai/schemastery` → **not in the seed table and never required by any shipped client bundle.** A client half cannot import it.
- `@deepseek-ai/dsh-client-ui-dockkit` → **seed, but it is not an npm package.** There is no `@deepseek-ai/dsh-client-ui-dockkit` directory. It is a namespace object built inside the shell: `const FS=Object.freeze(Object.defineProperty({__proto__:null,DOCK_EDGE_FRACTION:Q0,DOCK_ZONES:oS,DRAG_THRESHOLD:iS,DockController:aS,DockLayout:…},Symbol.toStringTag,{value:"Module"}))` (`FE` char ≈ 620 089). Treat it as an opaque ambient library.

### 2.4 How `dsh.client.external` works, and whether you must declare seeds

`external` exists **only** to name non-baseline requests. Seeds need no declaration — `require` checks `this.seed` first, before any graph walk.

For a non-baseline request:

```jsonc
// PKG(dsh-api-session-controller)\package.json:44-55
"dsh": {
  "client": {
    "external": ["@deepseek-ai/dsh-api-gateway/client"],
    "inject": ["@deepseek-ai/dsh-api-gateway", "@deepseek-ai/dsh-client-file-upload"],
    "platform": "web"
  }
}
```

Rules (from `orderByModuleGraph`, `\lib\index.js:405-437`, and `arriveGraphRow`, `\lib\client.js:644-661`):
- An `external` specifier is either the **exact string your bundle passes to `require`** (so `"@deepseek-ai/dsh-api-gateway/client"`, not the bare package name) or **an exact static-table key**. `stripClientSuffix` normalises `X/client` → `X` for the graph lookup, so both spellings of a package row resolve to the same exports.
- **A row must not declare its own package in `dsh.client.external`** — that throws: *"a row must not declare its own package in dsh.client.external"* (`index.js:428`).
- Composition **rejects malformed requests, missing suppliers, self-requests, and synchronous request cycles** (`README.md:46`; cycle error text at `index.js:424`).
- **`external` is a build/declaration-time ordering device, not a runtime grant.** At runtime the require either hits the seed table, a materialized module, or a registered factory — `external` only guarantees the supplier's factory registered first.

**Author-facing rule** (`PKG(dsh-client-ui-workspace)\README.md:163`):

> "A Module Loader package (`factory(require)`, as in the real Loader/Web fixture) gets `@deepseek-ai/dsh-client-ui-primitives` as an implicit baseline external: resolve `MenuItemButton` through the loader's `require`, do not list the primitive as a runtime dependency or bundle another copy, and declare a development dependency only when source compilation needs its types."

**But the skill's normative guidance is stricter — prefer not to import Harness Client packages at all.** `PKG(dsh-agent-preset)\skills\cordis-plugin-development\references\practices.md:35`:

> "Do not `require('@deepseek-ai/dsh-client-ui-primitives')` or load any other Harness Client package as a module; `dsh.client.inject` entries only order activation and stay allowed. […] Write your own controls and match the host instead: copy markup, CSS, and behavior from the primitive into the plugin […] Rename copied classes under your plugin's prefix, keep only `--dsw-alias-*` token references […]. Tokens then remain the only shared styling dependency."

### 2.5 `dsh.client.inject` means "activation order", not "module import"

`arriveGraphRow` (`client.js:656-659`) walks `row.inject` and arrives those **boot-graph rows** first. `inject` values are exact package names of other Loader entries (`PKG(dsh-client-ui-goal)\package.json:28-41` lists `"@deepseek-ai/dsh-api-remotes"`, `"@deepseek-ai/dsh-client-ui-conversation"`, …). `inject` does **not** give you their exports — a non-seed package's exports additionally need `external` + `require`.

---

## 3. CSS in a client half

### 3.1 The mounting mechanism is a literal `<style>` tag emitted inside the factory body

There is no `injectStyle` helper in the runtime. The build preset (`packages/client/tsdown.client.ts`, not shipped) rewrites each `import css from "./X.module.css"` into a virtual module region `\0dsh-css:<abs-source-path>.mjs` whose body is a CSS string, a dedupe-guarded style tag, and a local→scoped class map. Verbatim from `PKG(dsh-client-ui-goal)\lib\client.js:128-148`:

```js
//#region \0dsh-css:D:\develop\deepseek-harness\packages\client\ui-goal\src\client\GoalBar.module.css.mjs
const css$1 = ".yavUDa_dock{…}.yavUDa_bar{…}…";
const tagId$1 = "@deepseek-ai/dsh-client-ui-goal/GoalBar.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-goal";
  tag.dataset.pluginCss = tagId$1;
  tag.textContent = css$1;
  document.head.appendChild(tag);
}
var GoalBar_module_css_default = {
  "actions": "yavUDa_actions",
  "bar": "yavUDa_bar",
  "dock": "yavUDa_dock",
  …
};
//#endregion
```

Used as `GoalBar_module_css_default.dock` in `className`. This exact 11-line pattern repeats **158 times** across the shipped client bundles (same structure in `PKG(dsh-client-ui-plugin-manager)\lib\client.js:1210-1219`, `PKG(dsh-client-ui-chat)\lib\client.js` ×19, etc.).

`PKG(dsh-client-ui-theme)\lib\client.js:1177-1193` is the hand-authored (non-CSS-Modules) variant of the same idea, and is the cleanest template for a from-scratch plugin:

```js
/**
* Mount the global theme sheets for exactly the owning plugin lifetime.
* @param ctx - Owning plugin context.
*/
function installThemeStyles(ctx) {
  if (typeof document === "undefined") return;
  for (const [name, css] of STYLES) ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_ID;
    tag.dataset.pluginCss = `${PLUGIN_ID}/${name}`;
    tag.textContent = css;
    document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, `ui-theme: ${name} stylesheet`);
}
```

### 3.2 Class-name scoping: 6-char hash, one prefix per `.module.css` file

The manifest's own class names are **already prefixed** in the emitted region:

- `GoalBar.module.css` → `yavUDa_`
- `GoalCommandInputView.module.css` → `rXlZhG_`
- `JobListAction.module.css` → `KSI7ja_`
- `MessageFeedbackActions.module.css` → `TgevQq_`
- `FeedbackDialog.module.css` → `j5dluq_`
- `PlanPreview.module.css` → `douOyG_`
- `PluginManagerPage.module.css` → `INbgUW_`
- `ApprovalPanel.module.css` → `EpEjdW_`

Rule: **`<6 chars of [A-Za-z0-9]>` + `_` + `<local name in the source CSS>`**, prefixed on every selector in the file, with the runtime map `{ localName: "<prefix>_<localName>" }` emitted beside it. The prefix is per **file**, so two files in one package get different prefixes. This is deterministic from the source path (stable across builds) — class names are effectively content-addressed by path, not by package name.

**Does the author need to do it by hand?** Only if authoring `lib/client.js` by hand (the supported no-build path). The **runtime** does not require a hash: it only requires
1. class names unique enough not to collide with other plugins (the *convention* is a short hash prefix — the skill says *"Rename copied classes under your plugin's prefix"*, `practices.md:35`);
2. the tag attributes described below.

### 3.3 The runtime side: `data-plugin` / `data-plugin-css` are load-bearing for HMR

The tags are not decorative — the module system owns them for teardown. `client.js:190-197`:

```js
/**
* Remove styles after their plugin's effect cleanup has settled.
* @param id - Package whose factory owns the style tags.
*/
function removeOwnedStyles(id) {
  if (typeof document === "undefined") return;
  for (const el of document.querySelectorAll("style[data-plugin]")) if (el.getAttribute("data-plugin") === id) el.remove();
}
```

`removeOwnedStyles(ownerId)` is called on `reload`, `updateManifest`, `prune` and on a factory throw (`client.js:312, 367, 690, 796, 821`).

`client.js:487-498`:

```js
/**
* Claim and inventory the <style> tags a factory injected during
* materialization: preset-emitted tags arrive pre-tagged with data-plugin;
* any untagged tag is claimed for the materializing plugin (HMR bookkeeping).
*/
const claimStyles = (id) => {
  if (typeof document === "undefined") return [];
  for (const el of document.querySelectorAll("style:not([data-plugin])")) el.setAttribute("data-plugin", id);
  const owned = [];
  for (const el of document.querySelectorAll(`style[data-plugin=${JSON.stringify(id)}]`)) owned.push(el.getAttribute("data-plugin-css") ?? id);
  return owned;
};
```

called immediately after `factory(...)` returns (`client.js:683-685`).

Operational consequences:
- **Inject your CSS at the top level of the `factory` body**, not inside `apply()` and not lazily on first render. `claimStyles` runs once, right after the factory returns; anything injected later stays untagged and is *not* torn down.
- **Set `data-plugin` = your package name explicitly.** Never rely on the untagged-claim path: it grabs *every* untagged `<style>` currently in `document.head` — including unrelated ones.
- **Set `data-plugin-css`** to a stable unique key (`"<pkg>/<file>.css"`) so the dedupe guard survives HMR re-materialization.
- `adoptedStyleSheets` / `CSSStyleSheet` are **not** used anywhere in DSH client plugins (only inside vendored pdf.js, `client.pdf.js:7755-7776`). Don't introduce them: `removeOwnedStyles` would not find them.

### 3.4 CSS in a *dynamic* client half is different

`@deepseek-ai/dsh-cordis-client-runner` closures get a `styles` seat instead (`PKG(dsh-cordis-client-runner)\lib\client.js:71-105`): `styles.insert(css) → disposer`, tags stamped `data-dyn="<pluginId>"`. That lane cannot use `require` at all (`\lib\client.js:49-56`: `require: "modules cannot be imported here. React arrives as the React closure symbol; everything else goes through ctx services or host.call."`). **This does not apply to a packaged plugin** — a packaged client half uses the factory/`require` lane.

### 3.5 Theme tokens

Style against `--dsw-*` custom properties only (`practices.md:34`): *"Style with the theme tokens that `cordis_inspect_query` `Theme` lists (`--dsw-alias-*`); literal colors are for artwork only."* Real usages: `var(--dsw-alias-label-primary)`, `var(--dsw-alias-border-l1)`, `var(--dsw-radius-md)`, `var(--dsw-elevation-panel)`, `var(--dsw-specific-menu)`, `var(--dsw-alias-state-error-primary)`. Query them live via `cordis_inspect_query { platform: "client", provider: "Theme", method: "listTokens" }`.

---

## 4. The host half (`lib/index.js`)

### 4.1 Accepted plugin export forms

From cordis itself, `PKG(cordis)\lib\index.js:1619-1641`:

```js
plugin(plugin, config, getOuterStack = buildOuterStack()) {
  const callback = this.resolve(plugin);
  if (!callback) throw new Error("invalid plugin, expect function or object with an \"apply\" method, received " + typeof plugin);
  this.ctx.fiber.assertActive();
  let runtime = this._internal.get(callback);
  if (!runtime) {
    let name = plugin.name;
    if (name === "apply") name = void 0;
    runtime = { name, callback, fibers: new DisposableList(), Config: plugin.Config };
    this._internal.set(callback, runtime);
  }
  const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack);
  ...
}
```

`isApplicable` (`cordis\lib\index.js:1446-1448`): `object && typeof object === "object" && typeof object.apply === "function"`.

`PKG(dsh-agent-preset)\skills\cordis-plugin-development\references\host-plugin.md:47-54`:

> `index.js` exports one of these forms; do not mix them:
> - `export function apply(ctx, config) {}` with optional `export const inject = ['tools']` and `export const Config`.
> - A service class as the default export.

Recognised module-level fields: **`apply`** (required), **`name`** (optional cordis plugin name), **`inject`** (array of service names, or a map `{ service: config }` — `Inject.resolve`), **`Config`** (schemastery schema). A class default export provides its service by constructor (`PKG(cordis)\lib\index.js:1772-1783`: `ctx.reflect.provide(name, self, this[symbols.check])`).

### 4.2 Complete, minimal host-only plugin — `PKG(dsh-persona)\lib\index.js` (50 lines, verbatim)

```js
import z from "@deepseek-ai/schemastery";
import { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION } from "@deepseek-ai/dsh-system-prompt";
//#region lib/types/index.js
/** Cordis plugin name. */
const name = "persona";
/** The prompt registry this row contributes to. */
const inject = ["systemPrompt"];
/** Runtime schema for the persona row. */
const Config = z.object({
	prefix: z.string().required(),
	suffix: z.string().default(""),
	complete: z.boolean().default(false),
	includeRuntimeContext: z.boolean().default(true)
});
function apply(ctx, config) {
	ctx.effect(() => ctx.systemPrompt.section({
		name: PERSONA_PREFIX_SECTION,
		order: ctx.systemPrompt.getSectionOrder("DEPLOYMENT_PERSONA_PREFIX"),
		text: config.prefix,
		...config.complete ? { complete: true } : {}
	}), "persona.section()");
	ctx.effect(() => ctx.systemPrompt.section({
		name: PERSONA_SUFFIX_SECTION,
		order: ctx.systemPrompt.getSectionOrder("DEPLOYMENT_PERSONA_SUFFIX"),
		text: config.suffix ?? ""
	}), "persona.suffix()");
	if (!(config.includeRuntimeContext ?? true)) ctx.systemPrompt.suppressRuntimeContext();
}
//#endregion
export { Config, PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION, apply, inject, name };
```

And a `Config`-less, service-consuming one — `PKG(dsh-skill-badge)\lib\index.js:44-53`:

```js
/** Cordis plugin name. */
const name = "skill-badge";
/** Service required by the bundled provider. */
const inject = ["skills"];
/** Register the bundled `dsh-badge` provider on `ctx.skills`. */
function apply(ctx) {
	ctx.skills.registerProvider(() => provider);
}
//#endregion
export { apply, inject, name };
```

### 4.3 The empty host half for a pure-UI plugin

`PKG(dsh-client-ui-goal)\lib\index.js` (entire file):

```js
//#region lib/types/index.js
/**
* Goal surface plugin, node half. Pure UI plugin: the empty apply exists so
* the plugin appears in the host cordis.yml / Loader; the browser half
* ships via exports["./client"], discovered through the package.json
* dsh.client declaration.
*/
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
//#endregion
export { apply };
```

and the skill template (`…\templates\decoration\index.js`):

```js
/** Host half of the decoration bundle; the Client module owns the rendering. */
export function apply() {}
```

### 4.4 Declaring a `Config` schema

`Config` is a `@deepseek-ai/schemastery` schema (`PKG(schemastery)\package.json`, v3.18.4; entry `lib/index.mjs`, default-exported `Schema`). Idioms in the shipped tree:

```js
import z from "@deepseek-ai/schemastery";
const Config = z.object({
  prefix: z.string().required(),
  suffix: z.string().default(""),     // default
  complete: z.boolean().default(false),
  n: z.number(),                      // optional
  mode: z.union([z.const("a"), z.const("b")]),
  items: z.array(z.string()),
  map: z.dict(z.string()),
});
export { Config, apply, inject, name };
```

`cordis-plugin-loader` detects a schemastery schema by brand (`PKG(cordis-plugin-loader)\lib\index.js:252`): `schema?.["~standard"].vendor === "schemastery"`.

Validation happens at row activation against the row's `config`; the runtime passes **the validated, defaulted object** as `apply`'s second argument (`PKG(dsh-fs-local)\lib\index.js:755`: *"Validated config (schemastery applied the defaults before construction)"*). A `config` that fails validation leaves the entry inactive — it does not crash the app (`PKG(dsh-app-boot)\README.md:98`).

### 4.5 Providing and consuming services

**Provide** — either `new Service(ctx, name)` (which calls `ctx.reflect.provide` internally, `cordis\lib\index.js:1772-1783`), or explicitly:

```js
// PKG(cordis)\lib\index.js:800  — ctx.provide(name, value, check)
ctx.provide("myService", impl);
// PKG(cordis)\lib\index.js:774-785 — ctx.set(name, value); throws unless this fiber provided it
ctx.set("myService", impl);
// the exact call a Service subclass makes:
ctx.reflect.provide("modules", modules);   // PKG(dsh-client-modules)\lib\client.js:868
```

`cordis\lib\index.js:701-714` explains the guard: `cannot set property "<p>" without provide` unless `ctx.reflect.set` is used by the providing fiber.

**Consume** — three ways:

```js
export const inject = ["tools", "pluginManager", "sandboxPolicy"];   // static, activates only once present
// PKG(dsh-plugin-manager)\lib\types\tools.js:7
ctx.inject(["uiRenderer"], sub => { … });                            // scoped child ctx, callback form
// FE char ≈ 624 200
ctx.get("slots")                                                     // untyped lookup, may be undefined
// PKG(dsh-client-ui-renderer)\lib\invariant.js:23
```

`ctx.inject` is a first-class cordis method (`cordis\lib\index.js:1600-1606`):

```js
inject(inject, callback) {
  return this.plugin({ inject, apply: callback, name: callback.name });
}
```

`practices.md:20`: *"Put optional services in `inject` or `ctx.inject([...], ...)` so the plugin stays inactive in profiles without them instead of throwing."*

**Every registration must be owned by an effect** (`host-plugin.md:54`): *"Register every resource inside `apply` with `ctx.effect` or `ctx.on` and return its cleanup."* `ctx.effect(fn, label)` — `fn` returns a disposer (or an iterable of disposers, disposed in reverse order).

---

## 5. Slot occupancy — the `ctx.slots` service API

### 5.1 Two layers

- **`@deepseek-ai/dsh-client-ui-slots`** — pure, React-free, cordis-free core `SlotCore` + `SlotOwnershipError` / `StaleAuthorizationError` / `resolveSlotLabel` / `standardHookPropName`. Exports at `PKG(dsh-client-ui-slots)\lib\index.js:575`. **This is a seed module**, so a client half may `require("@deepseek-ai/dsh-client-ui-slots")` for the error classes and the core.
- **`ctx.slots`** — the live cordis `Service` wrapping it, provided by `@deepseek-ai/dsh-client-ui-renderer` (`SlotRegistry extends Service`, `PKG(dsh-client-ui-renderer)\lib\client.js:1280`, `super(ctx, "slots")` at `:1323`). `ctx.slots` requires `@deepseek-ai/dsh-client-ui-renderer` to be mounted, which the web roster always does.

### 5.2 `slots.register(options, component)` — exact signature and option fields

`PKG(dsh-client-ui-renderer)\lib\client.js:1788-1795`:

```js
SlotRegistry.prototype.register = function register(rawOptions, component) {
	const options = rawOptions;
	return this.ctx.effect(() => this["_register"](options, component), "slots.register()");
};
SlotRegistry.prototype.registerFactory = function registerFactory(rawOptions, component) {
	const options = rawOptions;
	return this.ctx.effect(() => this["_registerFactory"](options, component), "slots.registerFactory()");
};
```

Both are wrapped in `ctx.effect`, so **the registrant's fiber unload disposes the registration automatically**. The return value is the effect's disposer.

`_register` (`:1578-1598`) adds `registrant` (`this.ctx.fiber?.name`) and resolves a `store`.

Normalisation into the ledger entry (`SlotCore.register`, `PKG(dsh-client-ui-slots)\lib\index.js:204-222`) proves the exact field set:

```js
const entry = {
	component,
	options: {
		...options.key !== void 0 ? { key: options.key } : {},
		...options.id !== void 0 ? { id: options.id } : {},
		...options.order !== void 0 ? { order: options.order } : {},
		...options.label !== void 0 ? { label: options.label } : {},
		...options.priority !== void 0 ? { priority: options.priority } : {}
	},
	...options.select !== void 0 ? { select: options.select } : {},
	...options.inject !== void 0 ? { inject: options.inject } : {},
	...options.children !== void 0 ? { children: options.children } : {},
	...options.store !== void 0 ? { store: options.store } : {},
	...options.locale !== void 0 ? { locale: options.locale } : {},
	...options.registrant !== void 0 ? { registrant: options.registrant } : {}
};
```

| field | applies to | meaning |
|---|---|---|
| `name` | all | **slot key** (also carried on the entry via `options.name`); the slot must already be declared or `register` throws |
| `id` | **`list` kind — required** | cell identity; duplicates at same `priority` throw |
| `key` | **`keyed` kind — required** | dispatch key |
| `select` | **`chain` kind — required** | `(settings) => T \| null`; runs in ascending `priority`, first non-null elects, becomes the component's `matched` prop |
| `order` | `list` | display ordering *within* a cell (sort: `priority`, then `order`) |
| `priority` | all | shadowing priority — **lowest renders**; must be distinct per cell for `single`/`keyed`/`list` |
| `label` | all | display string **or thunk** resolved at read time via `resolveSlotLabel` (`ui-slots\lib\index.js:27-29`); a thunk follows the active locale |
| `locale` | all | locale namespace for this entry/definition |
| `inject` | all | business-props contribution — `(scopeKey, actions) => props` for a registration, `(scopeKey) => props` for a factory; contributes `hooks`, `keyedHooks`, and plain props merged into the component's props (`ui-renderer\lib\client.js:642-666`) |
| `children` | all | **the declaration table**: `{ "<child.slot.key>": { kind, scope } }` — this is how a parent declares slots |
| `slots` | `registerFactory` only | local Component selection: `{ "<localName>": { scope } }` |
| `store` | all | store seat: a `defineStore(...)` spec or an already-mounted handle |
| `registrant` | reserved | stamped from `ctx.fiber?.name`; don't set it |

Validation errors, from `SlotCore.register` (`ui-slots\lib\index.js:163-190`):

```js
if (!rec?.spec) throw new Error(`slot "${options.name}" is not declared (a parent entry's children table must declare it)`);
…
case "single":  if (occupant) throw new Error(`single slot "${options.name}" already has a registration ${occupantHint(occupant)}`);
case "keyed":   if (options.key === void 0) throw new Error(`keyed slot "${options.name}" requires options.key`);
                if (occupant) throw new Error(`keyed slot "${options.name}" already has an entry for key "${options.key}" …`);
case "list":    if (options.id === void 0) throw new Error(`list slot "${options.name}" requires options.id`);
                if (occupant) throw new Error(`list slot "${options.name}" already has an entry with id "${options.id}" …`);
case "chain":   if (options.select === void 0) throw new Error(`chain slot "${options.name}" requires options.select`);
```

`occupantHint` (`:168`): *"at priority N (registered by X) — register at a different priority to shadow it (lowest renders)"*.

**Declaration discipline** (`dsh-client-ui-slots\README.md:46`):

> "Declaring a slot is claiming it: the registering entry becomes the only entry allowed to render that key, and registering into an undeclared slot, declaring an already-declared child, mounting one shared handle under two scopes, or registering a chain without `select` throws at load. An entry's disposer collapses its declared child slots recursively — ledger rows, contributions, and store mounts die on one lifecycle axis."

**Kinds** (`README.md:28`): `single` (one occupant), `list` (ordered entries), `keyed` (dispatch by `key`), `chain` (entries elect themselves).

**Scope values** seen in the shipped tree: `"root"`, `"session"`, `"session-maybe"`. The `root` slot is the one a-priori declaration seeded at construction (`ui-slots\lib\index.js:64-72`).

### 5.3 `slots.inject(key, callback)` — waiting for a declaration

`PKG(dsh-client-ui-renderer)\lib\client.js:1328-1343` (doc + signature) and `:1369`, `:1390`:

```js
/**
* Install an effect for each declaration lifetime of a slot. The callback
* runs synchronously when the declaration already exists; otherwise it runs
* inside the declaring `register()` call after the declaration is committed.
* Collapse disposes the effect and a later declaration runs it again.
* …
* @param key - declared SlotMap key to depend on.
* @param callback - creates one disposer or an iterable of disposers.
* @returns idempotent disposer for the wait and active effect.
* @throws callback setup failures synchronously when the slot is already declared.
*/
inject(key, callback) {
	const ctx = this.ctx;
	const disposeController = ctx.effect(() => {
		let active, activeEpoch, stopped = false, unsubscribe = () => {};
		const stop = () => { … };
		const reconcile = () => {
			…
			const spec = this._core.specDynamic(key);
			const epoch = this._core.declarationEpoch(key);
			if (active !== void 0 && activeEpoch === epoch) return;
			…
			if (spec === void 0) return;
			const disposeEffect = ctx.effect(callback, `slots.inject(${JSON.stringify(key)}): declaration`);
			…
		};
		…
		unsubscribe = this._core.subscribeDeclaration(key, changed);
		…
	}, `slots.inject(${JSON.stringify(key)})`);
}
```

### 5.4 `slots.register` vs `slots.inject`

| | `slots.register(options, component)` | `slots.inject(key, callback)` |
|---|---|---|
| Purpose | **occupy** a slot your parent declared | **wait for** someone else's declaration to exist, then (usually) register |
| Failure if slot undeclared | throws `slot "<k>" is not declared` | never throws; the callback simply doesn't run yet |
| Lifetime | one effect per call; disposed on fiber unload | an effect per **declaration lifetime**; collapse disposes the callback's contribution, re-declaration re-runs it |
| Companion | `registerFactory(options, component)` + `renderFactorySlot()` | — |

**Canonical pairing** (skill template `…\templates\decoration\client.js`):

```js
ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
  name: 'conversation.composer.dock', id: 'my-decoration', order: 5,
}, Decoration));
```

`practices.md:36`: *"Contribute through slots: `ctx.slots.inject(ownerKey, () => ctx.slots.register(...))`. The callback's registrations are disposed when the owning declaration collapses and reinstalled when it returns. […] Do not write DOM outside your component or append to `document.body`."*

**Names to reuse** — declaration shape copied from `PKG(dsh-client-ui-conversation)\lib\client.js`:

```js
slots.registerFactory({
  name: "conversation.content",
  scope: "session-maybe",
  locale: NS,
  children: {
    "conversation.session":        { kind: "single", scope: "session" },
    "conversation.composer":       { kind: "chain",  scope: "session" },
    "conversation.composer.bar":   { kind: "single", scope: "session-maybe" },
    "conversation.input.dock":     { kind: "list",   scope: "session" },
    "conversation.hero.brand.mark":{ kind: "single", scope: "root" },
    …
  },
  slots: { views: { scope: "session" }, widthControls: { scope: "root" } },
  inject: (sessionId) => ({ hooks: {…}, selectWorkspace: (id) => … })
}, ConversationContent);
```

Real single/list registrations from the same file (`:18066-18203`) show `name`, `children`, `store`, `inject`, `locale` in use.

**Discover the live tree before writing** — `cordis_inspect_query { platform: "client", provider: "Slots", method: "listSubTree" }`, optionally with `{ root: "<exact slot key>" }` to get that slot's catalog and occupants. (`listSubTree` is declared in the provider manifest; the Skill's step 2 requires it, `SKILL.md:19`.)

---

## 6. Installation and enablement

### 6.1 The profile's `cordis.yml` must **not** be hand-edited — it is rewritten to `[]` on every start

`PKG(dsh)\lib\profile-boot-BZ2ZjNWi.js:120-127`:

```js
/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`;
/** Root config filename inside a profile directory. */
const PROFILE_ROOT_FILENAME = "cordis.yml";
```

and `:185-190`:

```js
function prepareProfile(name, userLayer = true, fromDefaultProfile) {
  …
  const profile = loadProfile(NAME, name, INSTALL_ANCHOR, void 0, { userLayer });
  reportSkippedBundles(NAME, profile);
  writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG);
  return profile;
}
```

(`:171-178` explains why: the Loader needs a real include root to anchor `baseUrl`, and the Loader's own tree write-back can bake composed rows back into the file, which would duplicate every insert on the next boot. This is exactly why the live file is 45 KB / 1282 lines today — that is write-back, not authored content.)

**So there is no "must edit `cordis.yml` by hand" step.** The composition is entirely patch layers, in this order (`PKG(dsh)\README.md:41-46`):

```
The tree composes over an empty root:
- each bundle's patch in `dsh.profile.bundles` order
- then the profile's `cordis.patch.yml`, then the home-level `$DSH_HOME/cordis.patch.yml`
- then `--patch` overlays

Bundles named in `dsh.profile.bundles` resolve from the dsh installation first (…), then from the
profile's own `node_modules`, where pnpm installs out-of-tree plugins.
```

### 6.2 The primary path: `plugin_manager` `install_bundle`

`PKG(dsh-plugin-manager)\lib\types\tools.js:14-24` documents the tool contract; `:69-76` maps `install_bundle` → `manager.installBundle(args.target, { enabled?, approvedBuilds?, registry? })`. `target` is "Plugin entry id, bundle package name, or **installation spec**".

`installBundle` (`PKG(dsh-plugin-manager)\lib\types\index.js:473-609`), the parts that decide your package layout:

```js
installBundle(spec, options) {
  …
  run = await this.runPnpm(['add', spec, ...registryArguments(registry)], control.abort.signal, requestId);
  …
  const after = readProfileManifest('dsh', this.profile.dir).dependencies ?? {};
  const installed = Object.keys(after).filter(name => before[name] !== after[name]);
  …
  const target = installed[0];
  if (installed.length !== 1 || target === undefined) throw new ManagementFailure('ambiguous-install');
  name = target;
  const dir = resolveBundleDir('dsh', name, this.profile.installAnchor, this.profile.dir);
  const manifest = bundleManifest(name, this.profile.dir, this.profile.installAnchor);
  if (manifest?.dsh?.bundle === undefined)
    throw new ManagementFailure('not-bundle');
  const compatibility = evaluatePluginCompatibility(manifest, readProfileVersionExemptions(this.profile.dir));
  if (compatibility !== undefined && !compatibility.exempted)
    throw new ManagementFailure('incompatible-version', [incompatiblePlugin(compatibility)]);
  for (const file of bundlePatchPaths(dir, manifest.dsh.bundle)) loadOverlayPatches('dsh', file);
  …
  control.phase = 'applying';
  announce('applying');
  result.bundle = name;
  result.target = name;
  result.stage = 'enable';
  return this.configure(async () => {
    if (options?.enabled !== false) await this.selectBundle(name, true);
    if (Object.hasOwn(before, name)) return 'restart-required';
    if (options?.enabled !== false) result.warnings = await this.reload();
  });
}
```

So `install_bundle`:
1. `pnpm add <spec>` **run in the profile directory** (with `--registry`), spec anchored relative to the caller's cwd for `./`/`../`/relative paths (`anchorPathSpec`, `tools\operations.js:19-24`).
2. Refuses unless `installed.length === 1` and the package declares **`dsh.bundle`** — otherwise `not-bundle`.
3. Writes the bundle name into `dsh.profile.bundles` (`selectBundle` → `writeProfileBundles`).
4. Reloads live (HMR) when the package was not already installed, else reports `restart-required`.

`plugin_manager` is a Host tool; its call is gated on `danger-full-access` or approval (`tools.js:31-37`).

The skill's summary (`SKILL.md:8`) is the recommended authoring loop: *"Use ordinary workspace files to author a bundle, then `plugin_manager` with `action: install_bundle` and the absolute package directory as `target` to install it in the current profile. Changes affect every session in that profile and survive restart."* And `SKILL.md:10`: *"Do not write the profile's `package.json` or `cordis.patch.yml`, create packages under `$DSH_HOME`, or run pnpm in the profile directory: `install_bundle` performs those steps."*

### 6.3 A bundle needs exactly three things

1. `package.json` with **`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`** — the "bundle" marker everything keys on (`bundles` selection, `not-bundle` refusal, `bundlePatchPaths`). One file, or an ordered list of files.
2. A patch file (the declared path) whose top-level YAML array inserts the Loader rows.
3. Nothing else. `host-plugin.md:7`: *"A Host-only bundle needs no dependencies, install scripts, or build tool."*

**Template `…\templates\decoration\package.json` (verbatim):**

```json
{
  "name": "@local/my-decoration",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
    }
  }
}
```

**Template `…\templates\decoration\cordis.patch.yml` (verbatim, complete):**

```yaml
- insert:
    - id: my-decoration
      name: '@local/my-decoration'
```

### 6.4 What a hand-written `cordis.patch.yml` layer can contain

`PKG(dsh-app-boot)\lib\index.js:3535-3544` — note the relative-path → file-URL rewrite inside `insert` rows:

```js
/** Convert inserted filesystem paths to file URLs, anchoring relative paths beside the patch; keep assertion names literal. */
function anchorInsertedPluginNames(patches, file) {
	const base = dirname(resolve(file));
	const visit = (entry) => {
		if (typeof entry.name === "string" && (isAbsolute(entry.name) || entry.name.startsWith("./") || entry.name.startsWith("../"))) entry.name = pathToFileURL(resolve(base, entry.name)).href;
		if (entry.group && Array.isArray(entry.config)) entry.config.forEach(visit);
	};
	for (const patch of patches) patch.insert?.forEach(visit);
	return patches;
}
```

Patch-entry semantics (`applyEntryPatches`, `\lib\index.js:73-92`): `insert` (optionally into the group named by `id`) appends rows; any other patch replaces the supplied fields of the row named by `id`, and **`config` is replaced wholesale, never deep-merged** (`app-boot\README.md:61`, `206`). `!!js` expressions are permitted (`PROFILE_PATCH_TEMPLATE`, `app-boot\lib\index.js:557-561`; live example `C:\Users\82077\.dsh\profiles\web\cordis.patch.yml:98`):
`X-Goog-Api-Key: !!js process.env.STITCH_API_KEY || ""`.

A row is `{ id, name, config?, inject?, disabled? }` — `id` is your arbitrary row key, `name` is the resolved module specifier (bare package, absolute path, or `file:` URL).

The live profile's own patch demonstrates an enable/disable override:
```yaml
# C:\Users\82077\.dsh\profiles\web\cordis.patch.yml:72-75
- id: ui-theme
  name: '@deepseek-ai/dsh-client-ui-theme'
  config:
    preference: system
```

### 6.5 Where the package physically lives

`resolveBundleDir` (`PKG(dsh-app-boot)\lib\index.js:900-906`) is the authoritative answer:

```js
function resolveBundleDir(binName, packageName, installAnchor, profileDir) {
	for (const anchor of [installAnchor, join(profileDir, "package.json")]) {
		const dir = packageDirFromAnchor(anchor, packageName);
		if (dir !== void 0) return dir;
	}
	throw new Error(`${binName}: cannot resolve profile bundle ${JSON.stringify(packageName)} from the dsh installation or ${profileDir}; run 'dsh plugin --profile ${basename(profileDir)} install' if its dependency is not installed`);
}
```

**Two anchors, installation first, then the profile.** With `installAnchor` = `@deepseek-ai/dsh/package.json` and `profileDir` = `C:\Users\82077\.dsh\profiles\web`, a third-party plugin resolves only via the second anchor — i.e. **`C:\Users\82077\.dsh\profiles\web\node_modules\<name>\`** (pnpm `nodeLinker: hoisted`, `pnpm-workspace.yaml:4`; `pnpm add` writes the real directory there, or a hoisted link under `node_modules/.pnpm`).

The cordis Loader resolves the *Loader row* name with `baseUrl` anchored at the profile directory: `boot(NAME, join(profile.dir, "cordis.yml"), …)` (`profile-boot-BZ2ZjNWi.js:258-271`) and `ctx.baseUrl = pathToFileURL(dirname(absoluteConfigPath)).href + "/"` (`app-boot\lib\index.js:4069`). Plus `createRuntimeResolution` (`app-boot\README.md:138`) supplies installation-owned names from `$DSH_HOME\profiles\node_modules` and app-boot owns exports/conditions/subpaths.

Practical consequence: **a specifier that is a bare package name resolves only if the package sits in `<profile>/node_modules/<name>`** (or is installation-owned). An absolute path or a path-relative `./my-plugin` in a patch works without any `node_modules` at all — useful for a workspace-local development bundle.

### 6.6 `"dsh": { "profile": { "bundles": [...] } }` — the ordered bundle layer stack

`app-boot\lib\index.js:466-475` (module doc, verbatim):

```
* A profile is a directory under `$DSH_HOME/profiles/<name>` holding a
* `package.json` (out-of-tree plugin dependencies plus the profile manifest
* `dsh.profile` with its ordered `bundles` list) and a `cordis.patch.yml`
* (the user's own patch layer, applied after every bundle layer). Bundles are
* npm packages whose manifest declares
* `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` (one file, or an
* ordered list of files); the tree is composed by applying each bundle's patch
* lists in `dsh.profile.bundles` order over an empty entry list, then the
* profile's own patches, then any launcher layers (`--patch` files and
* flag-derived patches).
```

Live value (`C:\Users\82077\.dsh\profiles\web\package.json`, verbatim, 13 lines):

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ],
      "patchReload": "live"
    }
  }
}
```

Rules:
- Order **is** precedence: each bundle's patch list is applied over the accumulated entry list.
- The list is written by the manager, not by hand: `writeProfileBundles` (`app-boot\lib\index.js:1084-1097`) and `reconcile` (`plugin-manager\lib\types\operations.js:43-72`, quoting the bundle-selection logic):
  ```js
  const previous = after.dsh?.profile?.bundles ?? [];
  const bundles = previous.filter((name) => {
      if (!beforeDeps.has(name) && !dependencies.includes(name)) return true;
      return dependencies.includes(name) && bundleManifest(name, dir, anchor) !== undefined;
  });
  for (const name of dependencies) { … if (!bundles.includes(name)) bundles.push(name); }
  if (JSON.stringify(previous) === JSON.stringify(bundles)) return;
  after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles } };
  await saveManifest(dir, after);
  ```
  i.e. installation appends; a dependency with no `dsh.bundle` is installed but never selected (a plain dependency, with the warning *"declares no dsh.bundle — installed as a plain dependency, not a profile layer"*, `operations.js:59`).
- Bundle selection lives only in `package.json`; **plugin enable/disable lives in `cordis.patch.yml`** (`plugin-manager\README.md:40`: *"A plugin toggle updates only `disabled` in the last matching override in the profile's `cordis.patch.yml`, or appends an override when none matches. […] A bundle toggle changes `package.json`'s ordered `dsh.profile.bundles` list."*).
- Removing = deselect from `bundles` → unload runtime contributions → `pnpm remove` (`plugin-manager\README.md:148`).
- Bundle resolution / manifest / patch failures **skip** that bundle without changing selection and are printed once per start (`reportSkippedBundles`, `app-boot\README.md:50`).
- `patchReload: "live"` (this profile) makes patch + manifest changes apply without restart; `dsh-hmr` watches the manifest and both patch files (`dsh\README.md:37`).

---

## 7. Version and peer constraints

### 7.1 Versions

| fact | value | evidence |
|---|---|---|
| DSH release | `0.1.7-rc.2` | `ROOT\package.json:4` (`@deepseek-ai/dsh-desktop-runtime`); `ROOT\desktop-runtime.json` release.version |
| runtime version used by the compatibility check | `0.1.7-rc.2` | `getDshRuntimeVersion()` reads **`@deepseek-ai/dsh-app-boot`'s own `package.json`** (`app-boot\lib\index.js:271-275`); that version is `0.1.7-rc.2` |
| `@deepseek-ai/cordis` | `4.0.4` | `PKG(cordis)\package.json:4` |
| `@deepseek-ai/schemastery` | `3.18.4` | `PKG(schemastery)\package.json:4` |
| peer range every shipped plugin declares | `"@deepseek-ai/cordis": "~4.0.4"` | `PKG(dsh-client-ui-goal)\package.json:43-45`, `PKG(dsh-client-ui-primitives)\package.json`, … (uniform) |

### 7.2 What is actually range-checked

`evaluatePluginCompatibility` (`app-boot\lib\index.js:286-300`):

```js
function evaluatePluginCompatibility(manifest, exemptions = {}, runtimeVersion = getDshRuntimeVersion()) {
	runtimeVersionOf(runtimeVersion);
	const fields = objectOf$1(manifest, "Plugin manifest");
	if (!Object.hasOwn(fields, "peerDependencies")) return void 0;
	const dependencies = objectOf$1(fields.peerDependencies, "Plugin manifest peerDependencies");
	const peers = {};
	for (const [name, range] of Object.entries(dependencies)) {
		if (typeof range !== "string") throw new Error(`Plugin manifest peerDependencies[${JSON.stringify(name)}] must be a string`);
		if (name !== "@deepseek-ai/dsh" && !name.startsWith("@deepseek-ai/dsh-")) continue;   // <-- only dsh peers
		const requirement = ["workspace:^","workspace:~","workspace:*"].includes(range) ? runtimeVersion : range;
		if (requirement.trim() === "" || !semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })) peers[name] = range;
	}
	…
}
```

So:
- **Only `@deepseek-ai/dsh` and `@deepseek-ai/dsh-*` peers are enforced**, against the single runtime version, with prereleases participating. `@deepseek-ai/cordis: "~4.0.4"` is a convention and a resolution requirement, not a gate.
- **Missing DSH peers impose no constraint; invalid ranges are incompatible** (`app-boot\README.md:52`). A plugin with **no `peerDependencies` field at all** passes trivially.
- The consequence of a mismatch: installation is refused **before pnpm runs** with code `incompatible-version`, naming package, version, runtime version and unsatisfied peers (`plugin-manager\README.md:63`). An exact exemption (`package-name@version` → exact runtime versions) lives in the **profile's** `compatibility.json` and requires `acceptRisk: true`.
- `peerDependenciesMeta: { "<name>": { optional: true } }` is used in-tree (e.g. `PKG(dsh-api-session-controller)\package.json:106-116`) as a resolution hint, not an exemption.

**Recommended, safe declaration for a third-party plugin:**

```json
"peerDependencies": { "@deepseek-ai/cordis": "~4.0.4" }
```
(cordis resolves from the installation-owned runtime table at `$DSH_HOME\profiles\node_modules\@deepseek-ai\cordis`, which exists.) Declaring nothing is also admissible but gives up the only version signal.

### 7.3 Package naming: any valid npm name works; the DSH scope is **not** required

- The shipped plugin template names a third-party bundle **`@local/my-decoration`** (`…\templates\decoration\package.json:2`).
- The live profile's `node_modules/.bin` shim resolves `..\dsh-skill-mcp-panel\lib\cli.js` — an **unscoped** third-party package that was installed into the profile.
- The shared table `C:\Users\82077\.dsh\profiles\node_modules` contains `dsh-community-market`, `dsh-plugin-desktop-beta`, `dshmarket` (unscoped) alongside `@deepseek-ai/*`.
- A stale `@lim324` scope directory exists in `C:\Users\82077\.dsh\profiles\web\node_modules` from a prior third-party install.
- The only name-shaped validation is npm's own grammar, used for build approvals (`app-boot\lib\index.js:330`): `const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;`
- Two hard requirements instead: **the package name must be globally unique among active Loader sources** (`client-modules\README.md:72`) and **the client registration `id` must equal the package name**.

---

## 8. Minimal complete third-party UI plugin (assembled from the verified contracts)

Four files in one directory (this is byte-for-byte the shipped template shape, plus an explicit style tag per §3.3).

`package.json`
```json
{
  "name": "@local/my-decoration",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
    }
  },
  "peerDependencies": { "@deepseek-ai/cordis": "~4.0.4" }
}
```

`cordis.patch.yml`
```yaml
- insert:
    - id: my-decoration
      name: '@local/my-decoration'
```

`index.js`  (host half — required so the plugin appears in the Loader)
```js
/** Host half of the decoration bundle; the Client module owns the rendering. */
export function apply() {}
```

`client.js`  (browser half — classic script, self-registering factory)
```js
window.__ModuleLoader__.load({
  id: '@local/my-decoration',                 // MUST equal the package name
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require('react');            // seed table
    const h = React.createElement;

    // CSS: injected at FACTORY-BODY top level, tagged for owning-plugin teardown.
    const CSS = '.myDec_root{display:block;pointer-events:none}';
    const TAG_ID = '@local/my-decoration/client.js';
    if (typeof document !== 'undefined' &&
        document.querySelector('style[data-plugin-css=' + JSON.stringify(TAG_ID) + ']') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = '@local/my-decoration';   // removeOwnedStyles() key
      tag.dataset.pluginCss = TAG_ID;                // dedupe key
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function Decoration() {
      return h('svg', {
        className: 'myDec_root', viewBox: '0 0 64 64', width: 48, height: 48,
        'aria-hidden': true,
      }, h('circle', { cx: 32, cy: 32, r: 24, fill: 'var(--dsw-alias-label-primary)' }));
    }

    exports.inject = ['slots'];
    exports.apply = function apply(ctx) {
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock', id: 'my-decoration', order: 5,
      }, Decoration));
    };
    return module.exports;                     // REQUIRED
  },
});
```

Install: `plugin_manager { action: "install_bundle", target: "<absolute path to that directory>" }`. It runs `pnpm add` in the profile, verifies `dsh.bundle.patch`, appends the name to `dsh.profile.bundles`, applies the patch, and (HMR live) mounts the row in the running page — no restart, no hand edit of `cordis.yml` or `cordis.patch.yml`.

---

## 9. Gotchas that will bite a from-scratch author

1. **`id` in the registration must be the package name.** A mismatch means `graphRows.get(ownerId)` finds nothing; the row still arrives (factories keyed by the row id) only if `stripClientSuffix(id)` equals the row id — otherwise `arrive()` reports *"loaded without registering … via `__ModuleLoader__.load`"*.
2. **Return `module.exports` from the factory.** The loader stores the return value verbatim; `exports.foo = …` without the return gives `undefined`.
3. **Nothing may be `import`ed in `client.js`.** It is a classic script; `require` is the only module access, and only seeds / graph rows / own factories / own chunks resolve.
4. **`require("./relative")` throws.** Only `require.async("./client.<name>.js")` with a `chunk` registration.
5. **No `require` cycles** — fatal, not degraded.
6. **Inject styles at factory-body top level, tagged `data-plugin`.** Later injection is never torn down on unload/HMR.
7. **`dsh.client.platform` must be exactly `"web"`.**
8. **`exports["./client"]` must exist and the built file must be on disk at activation**, or activation fails with `client bundle not found; run pnpm run build before launch`.
9. **A row cannot list its own package in `external`.**
10. **Undeclared slots throw on `register`.** Use `slots.inject(key, cb)` as the outer wrapper, and confirm the key exists with `Slots.listSubTree`.
11. **Duplicate `register` at the same `priority` (and same `key`/`id`) throws.** Pick a distinct `priority` to shadow.
12. **Never touch the profile's `cordis.yml`** — it is overwritten with `[]` every start.
13. **The empty `apply()` on the host half is not optional** if you want the row in the Loader at all (the template's comment says exactly this).
14. **`@deepseek-ai/schemastery` is host-only.** A client half that needs validation must implement it itself (or use a seed library — none is provided).
15. **Do not edit the profile's `package.json`/`cordis.patch.yml` by hand** when a bundle install can do it; and note the policy that profile writes outside the workspace need their own approval (`SKILL.md:10`).
