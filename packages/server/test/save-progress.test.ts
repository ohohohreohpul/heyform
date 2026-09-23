import { CaptchaKindEnum, FieldKindEnum } from '@heyform-inc/shared-types-enums'
import * as assert from 'assert'

import { CompleteSubmissionResolver } from '../src/resolver/endpoint/complete-submission.resolver'
import { SaveProgressResolver } from '../src/resolver/endpoint/save-progress.resolver'

const NOW = Math.floor(Date.now() / 1_000)

function buildForm(overrides: Record<string, any> = {}) {
  return {
    id: 'form_1',
    teamId: 'team_1',
    name: 'Intake',
    suspended: false,
    fields: [
      { id: 'name_1', title: 'Name', kind: FieldKindEnum.SHORT_TEXT, validations: {} },
      {
        id: 'email_1',
        title: 'Email',
        kind: FieldKindEnum.EMAIL,
        validations: { required: true }
      },
      {
        id: 'notes_1',
        title: 'Notes',
        kind: FieldKindEnum.LONG_TEXT,
        validations: { required: true }
      }
    ],
    hiddenFields: [{ id: 'h1', name: 'utm_source' }],
    logics: [],
    variables: [],
    settings: { active: true, allowArchive: true, captchaKind: CaptchaKindEnum.NONE },
    ...overrides
  }
}

function buildResolver(form: any, enabled = true) {
  const sent: any[] = []
  const endpointService = {
    decryptToken: () => ({ formId: 'form_1', timestamp: NOW }),
    assertOpenToken: () => NOW
  }
  const progressCaptureService = {
    isEnabled: enabled,
    send: async (payload: any) => {
      sent.push(payload)
      return true
    }
  }
  const resolver = new SaveProgressResolver(
    endpointService as any,
    { findById: async () => form } as any,
    progressCaptureService as any
  )

  return { resolver, sent }
}

const baseInput = {
  formId: 'form_1',
  sessionId: 'session_12345',
  hiddenFields: [{ id: 'h1', name: 'utm_source', value: 'google' }],
  openToken: 'encrypted-token'
}

async function testSkipsUntilContactIsAnswered() {
  const { resolver, sent } = buildResolver(buildForm())

  const result = await resolver.saveProgress({ ...baseInput, answers: { name_1: 'Jamie' } })

  assert.strictEqual(result, false)
  assert.strictEqual(sent.length, 0)
}

async function testSendsAnsweredFieldsOnceContactIsValid() {
  const { resolver, sent } = buildResolver(buildForm())

  const result = await resolver.saveProgress({
    ...baseInput,
    answers: { name_1: 'Jamie', email_1: 'jamie@example.com' }
  })

  assert.strictEqual(result, true)
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].event, 'progress')
  assert.strictEqual(sent[0].sessionId, 'session_12345')
  assert.deepStrictEqual(
    sent[0].answers.map((answer: any) => answer.id),
    ['name_1', 'email_1']
  )
  assert.deepStrictEqual(sent[0].hiddenFields, { utm_source: 'google' })
}

async function testIgnoresUnknownHiddenFields() {
  const { resolver, sent } = buildResolver(buildForm())

  await resolver.saveProgress({
    ...baseInput,
    hiddenFields: [{ id: 'evil', name: 'injected', value: 'x' }],
    answers: { email_1: 'jamie@example.com' }
  })

  assert.deepStrictEqual(sent[0].hiddenFields, {})
}

async function testNoopWhenDisabled() {
  const { resolver, sent } = buildResolver(buildForm(), false)

  const result = await resolver.saveProgress({
    ...baseInput,
    answers: { email_1: 'jamie@example.com' }
  })

  assert.strictEqual(result, false)
  assert.strictEqual(sent.length, 0)
}

async function testRejectsInactiveFormsAndBadSessions() {
  const inactive = buildResolver(buildForm({ settings: { active: false } }))
  await assert.rejects(() =>
    inactive.resolver.saveProgress({ ...baseInput, answers: { email_1: 'jamie@example.com' } })
  )

  const { resolver } = buildResolver(buildForm())
  await assert.rejects(() =>
    resolver.saveProgress({
      ...baseInput,
      sessionId: 'bad session!',
      answers: { email_1: 'jamie@example.com' }
    })
  )
}

async function testCompleteSubmissionForwardsFinalEvent() {
  const sent: any[] = []
  const form = buildForm()
  const resolver = new CompleteSubmissionResolver(
    {
      decryptToken: () => ({ formId: 'form_1', timestamp: NOW }),
      assertOpenToken: () => NOW,
      verifySpam: async () => false
    } as any,
    { findById: async () => form } as any,
    { createWithinQuota: async () => 'submission_1' } as any,
    { checkIp: async () => undefined } as any,
    { addQueue: () => undefined } as any,
    { addQueue: () => undefined } as any,
    {} as any,
    {
      isEnabled: true,
      send: async (payload: any) => {
        sent.push(payload)
        return true
      }
    } as any
  )
  const client = { ip: '203.0.113.10', deviceId: 'd', lang: 'en', userAgent: {} as any }
  const answers = { name_1: 'Jamie', email_1: 'jamie@example.com', notes_1: 'Two cats' }

  await resolver.completeSubmission(client, 'anon', {
    formId: 'form_1',
    answers,
    hiddenFields: [],
    openToken: 'encrypted-token',
    progressSessionId: 'session_12345'
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].event, 'complete')
  assert.strictEqual(sent[0].sessionId, 'session_12345')
  assert.strictEqual(sent[0].submissionId, 'submission_1')

  // Without a session id there is nothing to reconcile, so nothing is sent.
  await resolver.completeSubmission(client, 'anon', {
    formId: 'form_1',
    answers,
    hiddenFields: [],
    openToken: 'encrypted-token'
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.strictEqual(sent.length, 1)
}

async function run() {
  await testSkipsUntilContactIsAnswered()
  await testSendsAnsweredFieldsOnceContactIsValid()
  await testIgnoresUnknownHiddenFields()
  await testNoopWhenDisabled()
  await testRejectsInactiveFormsAndBadSessions()
  await testCompleteSubmissionForwardsFinalEvent()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
