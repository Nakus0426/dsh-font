import test from 'node:test'
import assert from 'node:assert/strict'
import { cssFamilyValue, searchFonts, sortFonts, DEFAULT_CODE_STACK } from '../src/font-utils.ts'

const fonts = [
  { family: 'Arial', aliases: ['Arial Bold'], fixed: false, weights: [400, 700] },
  { family: 'Maple Mono', aliases: ['枫叶等宽'], fixed: true, weights: [400] },
]

test('search matches family and localized aliases', () => {
  assert.equal(searchFonts(fonts, '枫叶').length, 1)
  assert.equal(searchFonts(fonts, 'arial').length, 1)
})

test('fixed fonts sort first', () => {
  assert.deepEqual(sortFonts(fonts, 'zh').map((font) => font.family), ['Maple Mono', 'Arial'])
})

test('css family value keeps fallback and escapes quotes', () => {
  assert.equal(cssFamilyValue('A"B', DEFAULT_CODE_STACK), '"A\\"B", ' + DEFAULT_CODE_STACK)
})
