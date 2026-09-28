import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DEFAULT_CODE_STACK,
  DEFAULT_UI_STACK,
  cssFamilyValue,
  searchFonts,
  sortFonts,
  type FontRecord,
} from './font-utils.js'

/** Locale namespace owned by this plugin. */
const NS = 'settings.dsh-font'

/** Loader entry id whose Config document this page edits. */
const ENTRY_ID = 'dsh-font'

/** English copy. */
const en = {
  title: 'Fonts',
  intro: 'Change the fonts used by the interface and by code. Selecting a font applies immediately.',
  uiTitle: 'Interface font',
  uiHint: 'Used by settings, the sidebar, messages, and other interface text.',
  codeTitle: 'Code font',
  codeHint: 'Used by code blocks, command output, and code previews.',
  default: 'Default',
  search: 'Search fonts',
  loading: 'Reading installed fonts…',
  empty: 'No matching fonts',
  source: 'Host fonts · {count}',
  monospace: 'Monospace',
  reset: 'Reset to default',
  failed: 'Could not read the font catalog. Reopen this page to retry.',
  saveFailed: 'Applied, but DSH did not save this choice, so it will not survive a reload.',
  readOnly: 'This deployment stores settings read-only.',
}

/** Simplified Chinese copy. */
const zh = {
  title: '字体',
  intro: '修改界面与代码使用的字体。选中后立即生效。',
  uiTitle: '界面字体',
  uiHint: '用于设置、侧栏、消息和其他界面文字。',
  codeTitle: '代码字体',
  codeHint: '用于代码块、命令输出和代码预览。',
  default: '默认',
  search: '搜索字体',
  loading: '正在读取系统字体…',
  empty: '没有匹配的字体',
  source: '主机字体 · {count}',
  monospace: '等宽',
  reset: '恢复默认',
  failed: '字体目录读取失败，重新打开本页可重试。',
  saveFailed: '已生效，但 DSH 没有保存这次选择，刷新后会丢失。',
  readOnly: '本部署的设置为只读。',
}

type FontField = 'uiFamily' | 'codeFamily'

type FormSnapshot = {
  status?: string
  value?: Partial<Record<FontField, string>>
  writable?: boolean
  mode?: string
}

type ConfigForm = {
  getSnapshot(): FormSnapshot
  subscribe(listener: () => void): () => void
  set(field: FontField, value: string): Promise<boolean>
  unset(field: FontField): Promise<boolean>
}

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
`

type FontChoice = Record<FontField, string>

const EMPTY_CHOICE: FontChoice = { uiFamily: '', codeFamily: '' }

/**
 * The applied font choice, owned by the plugin rather than by the settings page.
 *
 * The page unmounts whenever the user leaves the section, so the chosen fonts
 * must outlive it. This module-level record is also what the UI reads, which
 * lets a selection take effect before the Host round-trip completes.
 */
let choice: FontChoice = { ...EMPTY_CHOICE }
const choiceListeners = new Set<() => void>()

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
function applyFontVariables(uiFamily: string, codeFamily: string): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const targets: Array<[string, string]> = [
    ['--dsw-font-family', uiFamily],
    ['--ds-font-family-code', codeFamily],
    ['--dsw-font-mono', codeFamily],
  ]
  for (const [property, family] of targets) {
    if (family === '') root.style.removeProperty(property)
    else {
      const fallback = property === '--dsw-font-family' ? DEFAULT_UI_STACK : DEFAULT_CODE_STACK
      root.style.setProperty(property, cssFamilyValue(family, fallback))
    }
  }
}

function publishChoice(next: Partial<FontChoice>): void {
  const merged: FontChoice = { ...choice, ...next }
  if (merged.uiFamily === choice.uiFamily && merged.codeFamily === choice.codeFamily) return
  choice = merged
  applyFontVariables(choice.uiFamily, choice.codeFamily)
  for (const listener of [...choiceListeners]) listener()
}

function readChoice(form: ConfigForm): FontChoice {
  const value = form.getSnapshot().value ?? {}
  return { uiFamily: value.uiFamily ?? '', codeFamily: value.codeFamily ?? '' }
}

function subscribeChoice(listener: () => void): () => void {
  choiceListeners.add(listener)
  return () => { choiceListeners.delete(listener) }
}

/**
 * Mount this plugin's stylesheet once, tagged for owner-scoped teardown.
 * The tag must be created while the module factory materializes so the module
 * loader's style claiming can attribute and later remove it.
 */
function installStyles(): void {
  if (typeof document === 'undefined') return
  const tagId = 'dsh-font/client.css'
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-font'
  tag.dataset.pluginCss = tagId
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** One font row inside the dropdown. */
function FontOption(props: {
  font: FontRecord
  selected: boolean
  active: boolean
  monospaceLabel: string
  onHover: () => void
  onChoose: () => void
}): React.ReactElement {
  const name = React.createElement('span', {
    className: 'dshFont_optionName',
    style: { fontFamily: cssFamilyValue(props.font.family, 'sans-serif') },
  }, props.font.family)
  const badge = props.font.fixed
    ? React.createElement('span', { className: 'dshFont_optionMeta' }, props.monospaceLabel)
    : null
  const check = React.createElement('span', { className: 'dshFont_check', 'aria-hidden': true }, props.selected ? '✓' : '')
  return React.createElement('button', {
    type: 'button',
    role: 'option',
    className: 'dshFont_option',
    'aria-selected': props.selected,
    'data-active': props.active,
    onMouseEnter: props.onHover,
    onFocus: props.onHover,
    onClick: props.onChoose,
  }, name, badge, check)
}

/** A search-assisted dropdown that reports the chosen family. */
function FontMenu(props: {
  value: string
  fonts: FontRecord[]
  label: string
  disabled: boolean
  t: (key: string) => string
  onSelect: (family: string) => void
}): React.ReactElement {
  const { value, fonts, label, disabled, t, onSelect } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const filtered = useMemo(() => sortFonts(searchFonts(fonts, query), 'zh'), [fonts, query])

  useEffect(() => {
    if (!open) return undefined
    const measure = (): void => setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (triggerRef.current?.contains(target as Node) === true) return
      if (target?.closest('.dshFont_menu') != null) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    searchRef.current?.focus()
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  const close = (): void => {
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }
  const choose = (family: string): void => {
    onSelect(family)
    close()
  }
  const move = (delta: number): void => {
    setActive(Math.min(Math.max(active + delta, 0), Math.max(filtered.length - 1, 0)))
  }
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
    if (event.key === 'Enter' && filtered[active] !== undefined) {
      event.preventDefault()
      choose(filtered[active].family)
    }
  }

  const chevron = React.createElement('span', { className: 'dshFont_chevron', 'aria-hidden': true }, '▾')
  const triggerLabel = React.createElement('span', {
    className: 'dshFont_triggerLabel',
    style: value === '' ? undefined : { fontFamily: cssFamilyValue(value, 'sans-serif') },
  }, value === '' ? t('default') : value)
  const trigger = React.createElement('button', {
    ref: triggerRef,
    type: 'button',
    className: 'dshFont_trigger',
    'aria-haspopup': 'listbox',
    'aria-expanded': open,
    'aria-label': label,
    disabled,
    onClick: () => setOpen((current) => !current),
  }, triggerLabel, chevron)

  if (!open || rect === null) return trigger

  const search = React.createElement('input', {
    ref: searchRef,
    className: 'dshFont_search',
    value: query,
    placeholder: t('search'),
    'aria-label': t('search'),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    onKeyDown,
  })
  const meta = React.createElement('div', { className: 'dshFont_meta' }, t('source').replace('{count}', String(fonts.length)))
  const options = filtered.map((font, index) => React.createElement(FontOption, {
    key: font.family,
    font,
    selected: font.family === value,
    active: index === active,
    monospaceLabel: t('monospace'),
    onHover: () => setActive(index),
    onChoose: () => choose(font.family),
  }))
  const list = React.createElement('div', {
    className: 'dshFont_list',
    role: 'listbox',
    'aria-label': t('search'),
  }, filtered.length === 0 ? React.createElement('div', { className: 'dshFont_empty' }, t('empty')) : options)

  const top = Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - 380))
  const left = Math.max(12, Math.min(rect.right - 340, window.innerWidth - 352))
  const menu = React.createElement('div', { className: 'dshFont_menu', style: { top, left }, onKeyDown }, search, meta, list)

  return React.createElement(React.Fragment, null, trigger, createPortal(menu, document.body))
}

/** One labelled settings row carrying a font dropdown and its reset action. */
function FontRow(props: {
  title: string
  hint: string
  value: string
  fonts: FontRecord[]
  resetLabel: string
  disabled: boolean
  t: (key: string) => string
  onChange: (family: string) => void
  onReset: () => void
}): React.ReactElement {
  const control = React.createElement(FontMenu, {
    value: props.value,
    fonts: props.fonts,
    label: props.title,
    disabled: props.disabled,
    t: props.t,
    onSelect: props.onChange,
  })
  const reset = props.value === '' || props.disabled
    ? null
    : React.createElement('button', {
      type: 'button',
      className: 'dshFont_reset',
      onClick: props.onReset,
    }, props.resetLabel)
  const text = React.createElement('div', { className: 'dshFont_rowText' },
    React.createElement('div', { className: 'dshFont_rowTitle' }, props.title),
    React.createElement('div', { className: 'dshFont_hint' }, props.hint))
  return React.createElement('div', { className: 'dshFont_row' }, text,
    React.createElement('div', { className: 'dshFont_control' }, control, reset))
}

/** The Fonts settings section. */
function FontSection(props: { t: (key: string) => string; configForms: any }): React.ReactElement {
  const { t, configForms } = props
  const form = configForms.get(ENTRY_ID) as ConfigForm
  const [applied, setApplied] = useState<FontChoice>(() => ({ ...choice }))
  const [snapshot, setSnapshot] = useState<FormSnapshot>(() => form.getSnapshot())
  const [fonts, setFonts] = useState<FontRecord[]>([])
  const [catalog, setCatalog] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => subscribeChoice(() => setApplied({ ...choice })), [])
  useEffect(() => form.subscribe(() => setSnapshot(form.getSnapshot())), [form])

  useEffect(() => {
    let live = true
    fetch('api/fonts.catalog')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data: { fonts?: FontRecord[] }) => {
        if (!live) return
        setFonts(Array.isArray(data.fonts) ? data.fonts : [])
        setCatalog('ready')
      })
      .catch(() => { if (live) setCatalog('failed') })
    return () => { live = false }
  }, [])

  const writable = snapshot.writable !== false
  /**
   * Persist one change and report a refusal.
   *
   * `set`/`unset` resolve to whether the Host accepted the write; a refusal
   * resolves `false` instead of rejecting, so the return value must be checked.
   */
  const persist = (operation: () => Promise<boolean>): void => {
    setSaveError(null)
    const report = (reason: string): void => {
      const current = form.getSnapshot()
      const facts = `status=${current.status ?? '?'} writable=${String(current.writable)} mode=${current.mode ?? '?'}`
      setSaveError(`${t('saveFailed')} [${reason}; ${facts}]`)
    }
    Promise.resolve()
      .then(operation)
      .then((accepted) => { if (accepted === false) report('rejected') })
      .catch((error: unknown) => report(error instanceof Error ? error.message : String(error)))
  }
  const select = (field: FontField, family: string): void => {
    publishChoice(field === 'uiFamily' ? { uiFamily: family } : { codeFamily: family })
    persist(() => form.set(field, family))
  }
  const reset = (field: FontField): void => {
    publishChoice(field === 'uiFamily' ? { uiFamily: '' } : { codeFamily: '' })
    persist(() => form.unset(field))
  }

  const children: React.ReactNode[] = [
    React.createElement('h2', { className: 'dshFont_title' }, t('title')),
    React.createElement('p', { className: 'dshFont_intro' }, t('intro')),
  ]
  if (catalog === 'loading') children.push(React.createElement('p', { className: 'dshFont_status', role: 'status' }, t('loading')))
  if (catalog === 'failed') children.push(React.createElement('p', { className: 'dshFont_error', role: 'alert' }, t('failed')))
  if (catalog === 'ready') {
    if (!writable) children.push(React.createElement('p', { className: 'dshFont_status', role: 'status' }, t('readOnly')))
    const rows: Array<[FontField, string, string]> = [
      ['uiFamily', t('uiTitle'), t('uiHint')],
      ['codeFamily', t('codeTitle'), t('codeHint')],
    ]
    for (const [field, title, hint] of rows) {
      children.push(React.createElement(FontRow, {
        key: field,
        title,
        hint,
        value: applied[field],
        fonts,
        t,
        disabled: !writable,
        resetLabel: t('reset'),
        onChange: (family: string) => select(field, family),
        onReset: () => reset(field),
      }))
    }
  }
  if (saveError !== null) children.push(React.createElement('p', { className: 'dshFont_error', role: 'alert' }, saveError))

  return React.createElement('section', { className: 'dshFont_section' }, children)
}

export const inject = ['slots', 'locale', 'configForms']

/**
 * Own the font variables for the plugin's lifetime and contribute the settings page.
 *
 * The persisted choice is adopted here rather than in the section component, for
 * two reasons: the section unmounts whenever the user leaves the page, and a
 * stored choice must therefore be applied before that page is ever opened.
 *
 * @param ctx - Client plugin context.
 */
export function apply(ctx: any): void {
  installStyles()
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-font: dictionaries')

  const form = ctx.configForms.get(ENTRY_ID) as ConfigForm
  ctx.effect(() => {
    publishChoice(readChoice(form))
    return form.subscribe(() => publishChoice(readChoice(form)))
  }, 'dsh-font: persisted choice')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'font',
    order: 12,
    label: () => t('title'),
    locale: NS,
    inject: () => ({ configForms: ctx.configForms }),
  }, FontSection))
}
