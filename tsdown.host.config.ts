import type { Options } from 'tsdown'

const config: Options = {
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'lib',
  dts: false,
  clean: false,
}

export default config
