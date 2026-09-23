import * as assert from 'assert'

import { buildFormPageMeta } from '../src/utils/form-page-meta'

function testUsesFormNameAndSeoSettings() {
  const meta = buildFormPageMeta({
    name: 'Get started',
    settings: {
      metaTitle: 'Book pet care | LovePetCare',
      metaDescription: 'Tell us about your pet.',
      metaOGImageUrl: 'https://example.com/og.jpg'
    }
  } as any)

  assert.deepStrictEqual(meta, {
    title: 'Book pet care | LovePetCare',
    description: 'Tell us about your pet.',
    image: 'https://example.com/og.jpg'
  })
}

function testFallsBackToFormName() {
  assert.deepStrictEqual(buildFormPageMeta({ name: 'Get started', settings: {} } as any), {
    title: 'Get started',
    description: undefined,
    image: undefined
  })
}

function testUnknownFormHasNoBrandedTitle() {
  assert.deepStrictEqual(buildFormPageMeta(null), {
    title: '',
    description: undefined,
    image: undefined
  })
}

testUsesFormNameAndSeoSettings()
testFallsBackToFormName()
testUnknownFormHasNoBrandedTitle()
