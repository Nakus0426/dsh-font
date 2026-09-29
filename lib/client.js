window.__ModuleLoader__.load({ id: "@nakus0426/dsh-font", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_dom = require("react-dom");
react_dom = __toESM(react_dom);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region src/font-utils.ts
function searchFonts(fonts, query) {
	const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
	if (!needle) return fonts;
	return fonts.filter((font) => [font.family, ...font.aliases].some((name) => name.toLocaleLowerCase().includes(needle)));
}
function sortFonts(fonts, locale) {
	return [...fonts].sort((a, b) => {
		return Number(b.fixed) - Number(a.fixed) || a.family.localeCompare(b.family, locale, { sensitivity: "base" });
	});
}
function cssFamilyValue(family, fallback) {
	return `"${family.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}", ${fallback}`;
}
const DEFAULT_UI_STACK = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
const DEFAULT_CODE_STACK = "\"SF Mono\", \"JetBrains Mono\", \"Fira Code\", Consolas, \"Liberation Mono\", Menlo, Courier, monospace";

//#endregion
//#region src/client.tsx
/** Locale namespace owned by this plugin. */
const NS = "settings.dsh-font";
/** Loader entry id whose Config document this page edits. */
const ENTRY_ID = "dsh-font";
/**
* This package's npm name.
*
* The client module system addresses its boot graph by package name
* (`graphRow(packageName, …)`), so this — not {@link ENTRY_ID} — is the id the
* bundle registers and the id its stylesheet is attributed to. The two name
* spaces stay separate on purpose: the cordis row id addresses the Loader row
* and this plugin's Config document, the package name addresses the browser
* module graph. `pnpm build:client` injects the same value into the bundle
* banner from `package.json`, and `test/client-bundle.test.mjs` holds them
* equal.
*/
const PACKAGE = "@nakus0426/dsh-font";
/** English copy. */
const en = {
	title: "Fonts",
	intro: "Change the fonts used by the interface and by code. Selecting a font applies immediately.",
	uiTitle: "Interface font",
	uiHint: "Used by settings, the sidebar, messages, and other interface text.",
	codeTitle: "Code font",
	codeHint: "Used by code blocks, command output, and code previews.",
	default: "Default",
	search: "Search fonts",
	loading: "Reading installed fonts…",
	empty: "No matching fonts",
	source: "Host fonts · {count}",
	monospace: "Monospace",
	reset: "Reset to default",
	failed: "Could not read the font catalog. Reopen this page to retry.",
	saveFailed: "Applied, but DSH did not save this choice, so it will not survive a reload.",
	readOnly: "This deployment stores settings read-only."
};
/** Simplified Chinese copy. */
const zh = {
	title: "字体",
	intro: "修改界面与代码使用的字体。选中后立即生效。",
	uiTitle: "界面字体",
	uiHint: "用于设置、侧栏、消息和其他界面文字。",
	codeTitle: "代码字体",
	codeHint: "用于代码块、命令输出和代码预览。",
	default: "默认",
	search: "搜索字体",
	loading: "正在读取系统字体…",
	empty: "没有匹配的字体",
	source: "主机字体 · {count}",
	monospace: "等宽",
	reset: "恢复默认",
	failed: "字体目录读取失败，重新打开本页可重试。",
	saveFailed: "已生效，但 DSH 没有保存这次选择，刷新后会丢失。",
	readOnly: "本部署的设置为只读。"
};
/**
* Hand-authored stylesheet.
*
* DSH ships CSS Modules, but a plugin bundle only receives the deployment's CSS
* tooling; keeping the sheet as a string lets this package build without one,
* and matches the host plugin pattern of mounting one tagged `<style>` tag.
* Class names are prefixed for this plugin and reference theme tokens only.
*/
const CSS = `
.dshFont_section{max-width:720px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:12px}
.dshFont_title{margin:0;font-size:16px;font-weight:500;line-height:24px}
.dshFont_intro{margin:0;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px}
.dshFont_status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshFont_error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;word-break:break-word}
.dshFont_row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}
.dshFont_rowText{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px;padding-right:32px}
.dshFont_rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.dshFont_hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshFont_control{flex:none;display:inline-flex;align-items:center;gap:8px}
.dshFont_trigger{height:36px;max-width:230px;border:0;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;padding:0 12px;display:inline-flex;align-items:center;gap:10px;cursor:pointer}
.dshFont_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshFont_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshFont_trigger:disabled{cursor:default;opacity:.5}
.dshFont_triggerLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshFont_chevron{flex:none;font-size:11px;opacity:.72}
.dshFont_reset{height:28px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:0 8px;cursor:pointer}
.dshFont_reset:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshFont_menu{position:fixed;z-index:1100;box-sizing:border-box;width:340px;max-width:calc(100vw - 24px);padding:4px;border-radius:var(--dsw-radius-lg);background:var(--dsw-menu-surface-fill);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent)}
.dshFont_search{box-sizing:border-box;width:100%;height:32px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 9px;outline:none}
.dshFont_search:focus{border-color:var(--dsw-alias-state-business-primary)}
.dshFont_meta{padding:7px 8px 4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}
.dshFont_list{margin-top:4px;max-height:300px;overflow-y:auto}
.dshFont_option{width:100%;min-height:34px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;display:flex;align-items:center;gap:7px;text-align:left;cursor:pointer}
.dshFont_option:hover,.dshFont_option[data-active=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dshFont_option:focus-visible{outline:none;background:var(--dsw-alias-interactive-bg-hover)}
.dshFont_optionName{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshFont_optionMeta{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dshFont_check{flex:none;width:14px;text-align:center}
.dshFont_empty{padding:14px 8px;color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center}
`;
/** Stylesheet tag id, also the dedupe key across re-materialization. */
const STYLE_TAG_ID = `${PACKAGE}/client.js`;
/**
* The applied font choice, owned by the plugin rather than by the settings page.
*
* The page unmounts whenever the user leaves the section, so the chosen fonts
* must outlive it. This module-level record is also what the UI reads, which
* lets a selection take effect before the Host round-trip completes.
*/
let choice = {
	uiFamily: "",
	codeFamily: ""
};
const choiceListeners = /* @__PURE__ */ new Set();
/**
* Write the chosen families onto the document root.
*
* An empty choice removes the property and restores the theme's own value.
* An inline custom property on `<html>` outranks the theme's `:root`
* declarations and cascades into every `--dsw-font-*-font-family` composite
* that references these base tokens.
*
* @param uiFamily - chosen interface family, or an empty string for the default.
* @param codeFamily - chosen code family, or an empty string for the default.
*/
function applyFontVariables(uiFamily, codeFamily) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const targets = [
		["--dsw-font-family", uiFamily],
		["--ds-font-family-code", codeFamily],
		["--dsw-font-mono", codeFamily]
	];
	for (const [property, family] of targets) if (family === "") root.style.removeProperty(property);
	else {
		const fallback = property === "--dsw-font-family" ? DEFAULT_UI_STACK : DEFAULT_CODE_STACK;
		root.style.setProperty(property, cssFamilyValue(family, fallback));
	}
}
function publishChoice(next) {
	const merged = {
		...choice,
		...next
	};
	if (merged.uiFamily === choice.uiFamily && merged.codeFamily === choice.codeFamily) return;
	choice = merged;
	applyFontVariables(choice.uiFamily, choice.codeFamily);
	for (const listener of [...choiceListeners]) listener();
}
function readChoice(form) {
	const value = form.getSnapshot().value ?? {};
	return {
		uiFamily: value.uiFamily ?? "",
		codeFamily: value.codeFamily ?? ""
	};
}
function subscribeChoice(listener) {
	choiceListeners.add(listener);
	return () => {
		choiceListeners.delete(listener);
	};
}
/**
* Mount this plugin's stylesheet once and return its teardown.
*
* The tag carries `data-plugin` — the package name, which is the id the loader
* attributes owned styles by — and `data-plugin-css` so a re-materialized
* factory does not add a second copy.
*
* @returns the disposer removing the tag this call created, if any.
*/
function mountStyles() {
	if (typeof document === "undefined") return () => {};
	if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) !== null) return () => {};
	const tag = document.createElement("style");
	tag.dataset.plugin = PACKAGE;
	tag.dataset.pluginCss = STYLE_TAG_ID;
	tag.textContent = CSS;
	document.head.appendChild(tag);
	return () => {
		tag.remove();
	};
}
/** One font row inside the dropdown, previewed in its own family. */
function FontOption(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		role: "option",
		className: "dshFont_option",
		"aria-selected": props.selected,
		"data-active": props.active,
		onMouseEnter: props.onHover,
		onFocus: props.onHover,
		onClick: props.onChoose,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dshFont_optionName",
				style: { fontFamily: cssFamilyValue(props.font.family, "sans-serif") },
				children: props.font.family
			}),
			props.font.fixed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dshFont_optionMeta",
				children: props.monospaceLabel
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dshFont_check",
				"aria-hidden": "true",
				children: props.selected ? "✓" : ""
			})
		]
	});
}
/** A search-assisted dropdown that reports the chosen family. */
function FontMenu(props) {
	const { value, fonts, label, disabled, t, onSelect } = props;
	const [open, setOpen] = (0, react.useState)(false);
	const [query, setQuery] = (0, react.useState)("");
	const [active, setActive] = (0, react.useState)(0);
	const [rect, setRect] = (0, react.useState)(null);
	const triggerRef = (0, react.useRef)(null);
	const searchRef = (0, react.useRef)(null);
	const filtered = (0, react.useMemo)(() => sortFonts(searchFonts(fonts, query), "zh"), [fonts, query]);
	(0, react.useEffect)(() => {
		if (!open) return void 0;
		const measure = () => setRect(triggerRef.current?.getBoundingClientRect() ?? null);
		measure();
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		const onPointerDown = (event) => {
			const target = event.target;
			if (triggerRef.current?.contains(target) === true) return;
			if (target?.closest(".dshFont_menu") != null) return;
			setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		searchRef.current?.focus();
		return () => {
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [open]);
	(0, react.useEffect)(() => {
		setActive(0);
	}, [query]);
	const close = () => {
		setOpen(false);
		setQuery("");
		triggerRef.current?.focus();
	};
	const choose = (family) => {
		onSelect(family);
		close();
	};
	const move = (delta) => {
		setActive(Math.min(Math.max(active + delta, 0), Math.max(filtered.length - 1, 0)));
	};
	const trigger = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		ref: triggerRef,
		type: "button",
		className: "dshFont_trigger",
		"aria-haspopup": "listbox",
		"aria-expanded": open,
		"aria-label": label,
		disabled,
		onClick: () => setOpen((current) => !current),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "dshFont_triggerLabel",
			style: value === "" ? void 0 : { fontFamily: cssFamilyValue(value, "sans-serif") },
			children: value === "" ? t("default") : value
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "dshFont_chevron",
			"aria-hidden": "true",
			children: "▾"
		})]
	});
	if (!open || rect === null) return trigger;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [trigger, (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dshFont_menu",
		style: {
			top: Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - 380)),
			left: Math.max(12, Math.min(rect.right - 340, window.innerWidth - 352))
		},
		onKeyDown: (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
				return;
			}
			if (event.key === "ArrowDown") {
				event.preventDefault();
				move(1);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				move(-1);
				return;
			}
			if (event.key === "Enter") {
				const font = filtered[active];
				if (font !== void 0) {
					event.preventDefault();
					choose(font.family);
				}
			}
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				ref: searchRef,
				className: "dshFont_search",
				value: query,
				placeholder: t("search"),
				"aria-label": t("search"),
				onChange: (event) => setQuery(event.target.value)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshFont_meta",
				children: t("source").replace("{count}", String(fonts.length))
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshFont_list",
				role: "listbox",
				"aria-label": t("search"),
				children: filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshFont_empty",
					children: t("empty")
				}) : filtered.map((font, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FontOption, {
					font,
					selected: font.family === value,
					active: index === active,
					monospaceLabel: t("monospace"),
					onHover: () => setActive(index),
					onChoose: () => choose(font.family)
				}, font.family))
			})
		]
	}), document.body)] });
}
/** One labelled settings row carrying a font dropdown and its reset action. */
function FontRow(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dshFont_row",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dshFont_rowText",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshFont_rowTitle",
				children: props.title
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshFont_hint",
				children: props.hint
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dshFont_control",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FontMenu, {
				value: props.value,
				fonts: props.fonts,
				label: props.title,
				disabled: props.disabled,
				t: props.t,
				onSelect: props.onChange
			}), props.value !== "" && !props.disabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dshFont_reset",
				onClick: props.onReset,
				children: props.resetLabel
			})]
		})]
	});
}
/** The Fonts settings section. */
function FontSection(props) {
	const { t, configForms } = props;
	const form = configForms.get(ENTRY_ID);
	const [applied, setApplied] = (0, react.useState)(() => ({ ...choice }));
	const [snapshot, setSnapshot] = (0, react.useState)(() => form.getSnapshot());
	const [fonts, setFonts] = (0, react.useState)([]);
	const [catalog, setCatalog] = (0, react.useState)("loading");
	const [saveError, setSaveError] = (0, react.useState)(null);
	(0, react.useEffect)(() => subscribeChoice(() => setApplied({ ...choice })), []);
	(0, react.useEffect)(() => form.subscribe(() => setSnapshot(form.getSnapshot())), [form]);
	(0, react.useEffect)(() => {
		let live = true;
		fetch("api/fonts.catalog").then((response) => {
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.json();
		}).then((data) => {
			if (!live) return;
			setFonts(Array.isArray(data.fonts) ? data.fonts : []);
			setCatalog("ready");
		}).catch(() => {
			if (live) setCatalog("failed");
		});
		return () => {
			live = false;
		};
	}, []);
	const writable = snapshot.writable !== false;
	/**
	* Persist one change and report a refusal.
	*
	* `set`/`unset` resolve to whether the Host accepted the write; a refusal
	* resolves `false` instead of rejecting, so the return value must be checked.
	*/
	const persist = (operation) => {
		setSaveError(null);
		const report = (reason) => {
			const current = form.getSnapshot();
			const facts = `status=${current.status ?? "?"} writable=${String(current.writable)} mode=${current.mode ?? "?"}`;
			setSaveError(`${t("saveFailed")} [${reason}; ${facts}]`);
		};
		Promise.resolve().then(operation).then((accepted) => {
			if (accepted === false) report("rejected");
		}).catch((error) => report(error instanceof Error ? error.message : String(error)));
	};
	const select = (field, family) => {
		publishChoice(field === "uiFamily" ? { uiFamily: family } : { codeFamily: family });
		persist(() => form.set(field, family));
	};
	const reset = (field) => {
		publishChoice(field === "uiFamily" ? { uiFamily: "" } : { codeFamily: "" });
		persist(() => form.unset(field));
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dshFont_section",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "dshFont_title",
				children: t("title")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dshFont_intro",
				children: t("intro")
			}),
			catalog === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dshFont_status",
				role: "status",
				children: t("loading")
			}),
			catalog === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dshFont_error",
				role: "alert",
				children: t("failed")
			}),
			catalog === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				!writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dshFont_status",
					role: "status",
					children: t("readOnly")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FontRow, {
					title: t("uiTitle"),
					hint: t("uiHint"),
					value: applied.uiFamily,
					fonts,
					t,
					disabled: !writable,
					resetLabel: t("reset"),
					onChange: (family) => select("uiFamily", family),
					onReset: () => reset("uiFamily")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FontRow, {
					title: t("codeTitle"),
					hint: t("codeHint"),
					value: applied.codeFamily,
					fonts,
					t,
					disabled: !writable,
					resetLabel: t("reset"),
					onChange: (family) => select("codeFamily", family),
					onReset: () => reset("codeFamily")
				})
			] }),
			saveError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dshFont_error",
				role: "alert",
				children: saveError
			})
		]
	});
}
const inject = [
	"slots",
	"locale",
	"configForms"
];
/**
* Own the font variables for the plugin's lifetime and contribute the settings page.
*
* The persisted choice is adopted here rather than in the section component, for
* two reasons: the section unmounts whenever the user leaves the page, and a
* stored choice must therefore be applied before that page is ever opened.
*
* @param ctx - Client plugin context.
*/
function apply(ctx) {
	ctx.effect(mountStyles, "dsh-font: stylesheet");
	const t = ctx.locale.bind(NS);
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "dsh-font: dictionaries");
	const form = ctx.configForms.get(ENTRY_ID);
	ctx.effect(() => {
		publishChoice(readChoice(form));
		return form.subscribe(() => publishChoice(readChoice(form)));
	}, "dsh-font: persisted choice");
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "font",
		order: 12,
		label: () => t("title"),
		locale: NS,
		inject: () => ({ configForms: ctx.configForms })
	}, FontSection));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; }});