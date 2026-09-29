# 实现细节与陷阱

面向维护者。README 只讲安装与使用，实现原理、开发与发布流程集中在本文。

## 实现概览

- Host（Node 侧）扫描 Windows 字体目录，用 `fontkit` 从字体文件的 `name` 表读取真实字体族名，展开 `.ttc`/`.otc` 集合并按 family 归并，通过 `GET /api/fonts.catalog` 提供字体目录。
- Client（浏览器侧）注册「字体」设置页，提供搜索、等宽字体置顶；选中即写 `:root` 内联 CSS 变量，并通过 `ctx.configForms` 持久化到 settings 文档。
- 两侧经 `ctx.connection.fetch.register()` 注册的 `/api/` 路由通信。

字体变量映射：

- 界面字体 → 覆盖 CSS 变量 `--dsw-font-family`
- 代码字体 → 覆盖 CSS 变量 `--ds-font-family-code`，同时设置 `--dsw-font-mono`

## 为什么必须有 Host 半边

字体名只能从**字体文件自身的 `name` 表**读出来，两条现成替代路都不行：

- Windows 注册表把每个字重当成独立 family。实测 407 条记录、392 条能映射到文件，其中 **195 条（约 50%）的显示名写进 CSS 会静默失效**：`"Arial Bold"` 的真实 family 是 `Arial`（文件 `arialbd.ttf`），`"Consolas Bold Italic"` 是 `Consolas`。
- 浏览器 `queryLocalFonts()` 返回**本地化名**（中文系统给「微软雅黑」），而 CSS `font-family` 对本地化名的匹配不可靠；DSH 全树对该 API 有 0 处引用。

Host 也无法直接把数据推给浏览器：

- `dsh-api-remotes/lib/client.js` 的 Remote capability 集合是**构建期硬编码的 23 项数组**，第三方插件无法新增命名空间，除非 fork 掉 shipped 的 BFF。
- Cordis 的 host Service 跨不过 host/client 边界（客户端的服务名是派生的 `remote.<ns>`）。

因此只剩 `/api/` 下的 HTTP 路由。官方先例：`dsh-client-ui-deliverables`、`dsh-client-hmr`、`dsh-session-log-export`。

### 字体名取值规则

CSS 值一律取 name 表的 `en` 记录：

- `fontFamily` / `preferredFamily` 按 locale 分桶（`en`、`zh`、`zh-SG`、`0-0`）。按「对象第一个 locale」取值会在中文系统上给出「微軟正黑體」。
- `preferredFamily` 在很多 Windows 字体里根本不存在（`msyh.ttc`、`simsun.ttc`、`arial.ttf` 都没有），所以必须有 `fontFamily.en` 兜底。
- 本地化名不丢弃，作为**搜索别名**保留，否则中文用户搜不到字体。
- `.ttc`/`.otc` 是集合，`parsed.fonts` 才是 face 列表；直接读 `parsed.familyName` 只会拿到第一个 face，会丢掉 `Microsoft YaHei UI`、`NSimSun`、`Cambria Math`。
- 按 family 归并，字重/斜体作为属性而非独立行：本机 394 个文件 → 218 个 family。

Host 侧的取数顺序是懒加载 + 进程内缓存：首次请求 `/api/fonts.catalog` 时才扫描（本机约 1.4s），激活插件不付这个成本。

## Client 模块加载契约

DSH 的客户端插件**不是**普通 ES 模块：

- bundle 以 **classic script** 加载（`document.createElement("script")`，没有 `type="module"`），所以 bundle 里出现 `import`/`export` 就是语法错误。
- 必须调用 `window.__ModuleLoader__.load({ id, factory })` 注册自己，否则启动报 `loaded without registering "<id>" via __ModuleLoader__.load`。
- **注册 id 必须等于包名**（或 `<包名>/client`）。cordis 行 id（`cordis.patch.yml` 里的 `dsh-font`）是另一个命名空间：它寻址 Loader 行与本插件的 Config 文档，不寻址浏览器模块图。
  - 写错的失效方式很响：`arrive()` 判定 bundle「没注册自己」，于是改用单资源 URL **再执行一次**该脚本，第二次 `load` 抛 `duplicate factory registration for "dsh-font"`；条目仍然拿不到 factory，web boot 随即以 `web boot: 1 entry did not activate` + `<包名>: import failed (see console for the import error)` 中止 —— 桌面端表现为启动即崩溃（`crash-*-web-boot.log`）。
- `factory` 内部是 CJS 风格：`require(spec)` + `module.exports`，且必须 `return module.exports`。
- `require` 只认固定的 **9 项平台种子模块**：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。没有 import map，没有相对模块解析（`require("./x")` 抛错）。
- `test/client-bundle.test.mjs` 用 `node:vm` 在独立上下文里求值 bundle，断言注册 id 等于包名，且没有 require 种子表以外的模块。

### 构建要点

- `tsdown` 用 `outExtensions: () => ({ js: '.js' })` 强制 `.js` 扩展名。`type: "module"` 下 CJS 默认产出 `.cjs`，而 DSH 按 `.js` 约定提供 bundle（`/plugins/<包名>/client.js?rev=<rev>`，且服务端拒绝 rev 不匹配的请求）。
- `module`/`exports` 容器由 banner 注入，footer 返回 `module.exports`。banner 里的注册 id 由 `tsdown.client.config.ts` 从 `package.json` 的 `name` 读出后注入，不再手写，避免与包名漂移。
- CSS 以字符串常量导出，在 `apply()` 内经 `ctx.effect` 注入 `<style data-plugin data-plugin-css>`，随插件卸载回收（与官方 `ui-theme` 的 `installThemeStyles` 一致）。`data-plugin` 取**包名**（loader 的 `removeOwnedStyles()` 按包名回收，HMR 重建时才能收掉旧 tag），`data-plugin-css` 是重复注入的去重键。

## Host 侧两条硬性要求（都会造成静默失效）

1. **可写字段必须声明 `.volatile()`。**

   settings 文档只接受位于 volatile 节点之下的写入路径。`@deepseek-ai/dsh-settings` 的 `write()` 会校验每个 op 路径：

   ```
   Config field "uiFamily" is not volatile
   ```

   官方可持久化字段都如此声明，例如 `dsh-client-ui-chat` 的
   `[TRANSCRIPT_VIEW_FIELD]: ChatSettingsFields[…].volatile()`、
   `dsh-agent-default-model` 的 `provider: z.string().required().volatile()`。
   `.default('')` 在前、`.volatile()` 在后。

2. **`set()` 被拒绝时返回 `false`，不抛异常。**

   `ConfigFormController.mutate` 在 `!response.ok` 时走 `recover()` 然后 `return false`
   （`dsh-client-ui-settings/lib/client.js`）。只写 `.catch()` 会把拒签当成功，表现为
   「选了立即生效、但重启后丢失且没有任何报错」——因为界面读的是插件自有状态，而它在写入失败时仍然生效。

   `test/config.test.mjs` 对第 1 条做回归断言（读构建产物），因为它的失效方式是静默的。

### 「settings 文档」到底是什么

不是独立文件。`ConfigEditor.documentPath` 返回的是 **profile 的 `cordis.patch.yml`**
（`dsh-config-editor/lib/index.js`），写入即把 `config:` 落回该文件，形如：

```yaml
- id: dsh-font
  disabled: false
  config:
    uiFamily: HarmonyOS Sans SC
    codeFamily: Maple Mono NF CN
```

所以 `$DSH_HOME` 下不会有 settings 文件，别去找。

### 插件安装与生效

- 新装的 bundle **必须重启 DSH** 才会被解析。DSH 的模块解析层在启动时计算 profile 的本地包集合，源码中新增本地包的多处路径明确要求 `requires a process restart`（`dsh-app-boot/lib/index.js`）。
- 不重启时的表现：条目停在 `fiberPhase: null`，报 `failed to import`，且**插件模块从未被求值**（可用模块顶层写文件的探针验证）。
- 仅客户端半边改动**不需要重启**：浏览器按 bundle 重新拉取，硬刷新页面即可。
- Loader 用裸 `import()` 加载插件（`cordis-plugin-loader/lib/index.js`，无破缓存参数），而 Node 的 ESM 缓存按 URL 缓存整个进程 —— 所以 disable → enable 的 reload **无法**拾取 Host 半边的代码改动。

## 开发

```bash
pnpm install
pnpm verify   # 格式检查 + lint + 类型检查 + 测试 + 构建，提交前跑这个
pnpm test     # 纯函数单测 + 真实系统字体扫描断言
pnpm build    # 产出 lib/index.js（Host，ESM）与 lib/client.js（Client，ModuleLoader 包装）
```

## 工具链与 oxc 的边界

代码类型校验与格式化都用 oxc 生态，但需要说清一件事：**oxc 自身不实现类型检查器。**

- `oxlint --type-aware` 只负责类型感知的 lint 规则；类型信息由独立后端 `oxlint-tsgolint` 提供，其平台二进制内置 `tsgo` 引擎（TypeScript 官方原生移植版），与项目 devDependencies 无关。
- 编译器级类型检查由 `pnpm typecheck`（`tsc --noEmit`）承担，`pnpm lint` 在其上加类型感知规则，两者共用同一份 `tsconfig.json`。
- `typescript@7.0.2` 即原生编译器（tsgo）的稳定发行版，已替代早先的 `@typescript/native-preview` dev 快照；`tsdown` 只在生成 `.d.ts` 时需要 JS 版编译器，本包用 `dts: false`，构建不受影响。
- `tsconfig.json` 开启 `strict`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax`、`jsx: react-jsx`，并用 `customConditions: ["node"]` 让 Host 侧按 Node 条件解析 —— `fontkit` 的 `browser` 入口与 Node 入口不同，不加这个条件 TS 会去解析 `dist/browser-module.mjs`。
- `.oxlintrc.json` 只做一件事：对 `test/**/*.mjs` 关闭 `typescript/no-floating-promises`（node:test 的 `test()` 返回值本就交给 runner）。
- `.oxfmtrc.json` 排除 `docs/**` 与 `test/fixtures/**`；`lib/`、`node_modules/` 由 `.gitignore` 排除。

## UI 约定

按 DSH 官方 `cordis-plugin-development` skill 的 `references/practices.md`：

- **不 `require` `@deepseek-ai/dsh-client-ui-primitives`**，而是把控件结构、CSS 与行为仿造进来。理由：primitives 会无预警变化，纯 JS 插件没有类型检查，且抛错的组件会让整个 slot 条目空白（控制台 `slot entry crashed in '<slot>'`）。类名用本插件前缀 `dshFont_`，只共享 `--dsw-*` 主题 token —— token 改名只会让外观退化，不会让渲染崩掉。
- 设置页沿用官方 General/Models 页的版式：`max-width:720px`、`h2` 16px/500/24、说明文字 `--dsw-alias-label-tertiary`、行分隔 `.5px solid var(--dsw-alias-border-l2)`、行内 `padding:16px 0`。
- **不要**给页面加外层水平内边距或自己的滚动容器 —— 外壳已提供 `padding:0 24px 24px` 与滚动。
- `settings.section` 页面需要自己渲染 `<h2>`，外壳不提供标题。

### 为什么不是 Vue

- 客户端 `require` 只认固定的 9 项种子模块，其中没有 Vue；bundle 也无法引入未申报的外部模块。
- slot 渲染器本身用 React 创建元素（`ctx.slots.register(options, Component)` 里的 `Component` 由渲染器渲染），签名上拿不到 DOM 容器去 `createApp().mount()`。
- `practices.md` 明确禁止替换 app root 或往 `document.body` 追加第二个应用。
- 硬塞的代价：把整个 Vue 运行时打进 bundle，在 React 树里再跑一个协调器，还拿不到 slot 传来的 `t`/`useStore`/`renderActions`，主题 token 也要重搭。

## 发布

发布走 GitHub Actions 一键流水线（[.github/workflows/release.yml](../.github/workflows/release.yml)），采用 npm **Trusted Publishing（OIDC）**：CI 以 GitHub 短时效身份令牌换取临时发布凭证，仓库不持有任何长期 npm token，发布产物自动带 provenance 签名。

### 首次发布（一次性，已完成）

npm 要求包已存在才能配置可信发布方，所以第一版手动发：

```bash
npm login --registry=https://registry.npmjs.org/
npm publish --registry=https://registry.npmjs.org/   # 触发 prepare 自动构建，发布 0.1.0
npm whoami --registry=https://registry.npmjs.org/    # 确认登录成功
```

显式指定官方源是因为本机全局 registry 配置的是 npmmirror 镜像（用于日常安装加速），镜像站不能发布；凭据按源地址存于 `~/.npmrc`，互不影响。

然后在 npmjs.com 该包页 **Settings → Trusted Publisher** 添加 GitHub Actions（字段区分大小写）：

- Organization or user：`Nakus0426`
- Repository：`dsh-font`
- Workflow filename：`release.yml`

可选加固：包 Settings → Publishing access 选 **Require two-factor authentication and disallow tokens**，关闭除 OIDC 之外的一切发布通道。

### 日常发布

1. Actions 页选 **Release** → **Run workflow** → 输入版本号 → 运行。
2. 流水线自动完成：版本号写入 `package.json` → `pnpm verify` 全量门禁 → 发布到 npmjs.com（provenance 签名）与 GitHub Packages → 提交版本号、打 `v*` tag → 创建 GitHub Release 并附上 `npm pack` 产物 tarball。

注意：同一版本号不能重复发布，流水线中途失败后需换下一个版本号重跑。
