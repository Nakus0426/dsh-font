# dsh-font

为 DSH Web 客户端增加「字体」设置页的本地插件。从系统实际安装的字体里选择界面字体与代码字体，选中后立即生效，并持久化到 DSH 的 settings 文档。

## 实现方式

- Host（Node 侧）扫描 Windows 字体目录，用 `fontkit` 从字体文件的 `name` 表读取真实字体族名，展开 `.ttc`/`.otc` 集合并按 family 归并，通过 `GET /api/fonts.catalog` 提供字体目录。
- Client（浏览器侧）注册「字体」设置页，提供搜索、等宽字体置顶；选中即写 `:root` 内联 CSS 变量，并通过 `ctx.configForms` 持久化到 settings 文档。
- 两侧经 `ctx.connection.fetch.register()` 注册的 `/api/` 路由通信。

字体变量映射：

- 界面字体 → 覆盖 CSS 变量 `--dsw-font-family`
- 代码字体 → 覆盖 CSS 变量 `--ds-font-family-code`，同时设置 `--dsw-font-mono`

## 使用

### 安装

通过 DSH 的插件管理器安装（它会跑 pnpm、校验 `dsh.bundle.patch`、把包写入 `dsh.profile.bundles` 并热加载）：

```
plugin_manager { action: "install_bundle", target: "<本目录绝对路径>", registry: "https://registry.npmjs.org" }
```

**新装的 bundle 需要重启 DSH 才会被解析。** 不重启时插件条目表现为 `failed to import`。

不要手工编辑 profile 的 `cordis.yml`（每次启动都会被覆写成 `[]`）、`package.json` 或 `cordis.patch.yml`。

### 选择字体

打开 DSH 设置侧栏的「字体」页，搜索并选中字体。选中后立即生效，重启 DSH 后保持。

## 开发

```bash
pnpm install
pnpm verify   # 格式检查 + lint + 类型检查 + 测试 + 构建，提交前跑这个
pnpm test     # 纯函数单测 + 真实系统字体扫描断言
pnpm build    # 产出 lib/index.js（Host，ESM）与 lib/client.js（Client，ModuleLoader 包装）
```

实现细节（模块加载契约、构建陷阱、Host 侧两条会造成静默失效的硬性要求）见 [docs/implementation-notes.md](docs/implementation-notes.md)。

## 已知限制

- 只枚举 `%SystemRoot%\Fonts` 与 `%LOCALAPPDATA%\Microsoft\Windows\Fonts`，不包含 Office 私有字体目录。
- 首选项来自 Host 机器，不是浏览器所在机器。本部署为 loopback（`127.0.0.1`），两者一致；局域网访问时列表会与浏览器所在机器的字体不符。
- 安装了新字体需重启 DSH 才能在列表中看到。
