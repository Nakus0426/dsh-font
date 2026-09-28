import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hostBundle = join(root, 'lib', 'index.js')

test('every Config field is volatile so the settings document accepts writes', { skip: existsSync(hostBundle) ? false : 'run pnpm build first' }, async () => {
  const host = await import(pathToFileURL(hostBundle).href)
  const dict = host.Config?.dict ?? {}
  const fields = Object.keys(dict)
  assert.ok(fields.length >= 2, `expected the two font fields, found: ${fields.join(', ') || 'none'}`)

  for (const field of fields) {
    // Without this marker the Host refuses every write with
    // `Config field "<field>" is not volatile`, and the Client reports that
    // refusal only as a resolved `false`, so the picker appears to work while
    // nothing persists. See @deepseek-ai/dsh-settings `write()`.
    assert.equal(
      dict[field]?.meta?.volatile,
      true,
      `${field} must be declared .volatile() or selections will silently fail to persist`,
    )
  }
})
