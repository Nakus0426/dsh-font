# dsh-font

为 DSH Web 客户端增加「字体」设置页的本地插件。从系统实际安装的字体里选择界面字体与代码字体，选中后立即生效，并持久化到 DSH 的 settings 文档。

## 安装

通过 DSH 的插件管理器安装（支持三种形式）：

```
# npm 包名
@nakus0426/dsh-font

# GitHub 仓库地址
https://github.com/Nakus0426/dsh-font

# 本地目录路径
<本目录绝对路径>
```

**新装的 bundle 需要重启 DSH 才会被解析。** 不重启时插件条目表现为 `failed to import`。

也可从 [GitHub Releases](https://github.com/Nakus0426/dsh-font/releases) 下载 `*.tgz` 解压后，对解压目录执行同样的安装命令。

不要手工编辑 profile 的 `cordis.yml`（每次启动都会被覆写成 `[]`）、`package.json` 或 `cordis.patch.yml`。

## 选择字体

打开 DSH 设置侧栏的「字体」页，搜索并选中字体。选中后立即生效，重启 DSH 后保持。

## 已知限制

- 只枚举 `%SystemRoot%\Fonts` 与 `%LOCALAPPDATA%\Microsoft\Windows\Fonts`，不包含 Office 私有字体目录。
- 首选项来自 Host 机器，不是浏览器所在机器。本部署为 loopback（`127.0.0.1`），两者一致；局域网访问时列表会与浏览器所在机器的字体不符。
- 安装了新字体需重启 DSH 才能在列表中看到。

---

开发、构建与发布流程见 [docs/implementation-notes.md](docs/implementation-notes.md)。
