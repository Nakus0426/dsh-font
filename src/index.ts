import z from '@deepseek-ai/schemastery'
import { getCatalog } from './font-catalog.js'

/** Cordis plugin name. */
export const name = 'dsh-font'

/** Connection provides the authenticated Fetch-route fence this plugin registers inside. */
export const inject = ['connection']

/**
 * Settings-document fields owned by this plugin entry.
 *
 * Both fields are `volatile`. Only a field beneath a volatile schema node may be
 * written through `ctx.remote.settings.mutate`; an unmarked field makes every
 * write from the Client fail with `Config field "…" is not volatile`. Volatile
 * also means the Host adopts a new value without remounting the plugin.
 */
export const Config = z.object({
  uiFamily: z.string().default('').volatile(),
  codeFamily: z.string().default('').volatile(),
})

/**
 * Serve the installed font catalog over an authenticated GET route.
 *
 * The scan is lazy and memoized, so plugin activation never pays the font-read
 * cost; the first request after a restart does. `register` owns its own effect
 * on the reading context and returns that disposer.
 *
 * @param ctx - Cordis context carrying the Connection route registry.
 */
export function apply(ctx: any): void {
  ctx.connection.fetch.register({
    path: '/api/fonts.catalog',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => Response.json(
      { fonts: await getCatalog() },
      { headers: { 'cache-control': 'no-store' } },
    ),
  })
}
