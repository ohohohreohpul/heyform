import { FieldKindEnum } from '@heyform-inc/shared-types-enums'
import * as assert from 'assert'
import { createHmac } from 'crypto'

import {
  buildProgressPayload,
  collectProgressAnswers,
  hasContactAnswer,
  isValidProgressSessionId,
  signProgressPayload
} from '../src/utils/progress-capture'

const FIELDS: any[] = [
  { id: 'name_1', title: 'Your name', kind: FieldKindEnum.SHORT_TEXT, validations: {} },
  {
    id: 'email_1',
    title: 'Email',
    kind: FieldKindEnum.EMAIL,
    validations: { required: true }
  },
  {
    id: 'phone_1',
    title: 'Phone',
    kind: FieldKindEnum.PHONE_NUMBER,
    validations: { required: true }
  },
  {
    id: 'notes_1',
    title: 'Anything else?',
    kind: FieldKindEnum.LONG_TEXT,
    validations: { required: true }
  }
]

function testSessionIdValidation() {
  assert.strictEqual(isValidProgressSessionId('abcDEF12'), true)
  assert.strictEqual(isValidProgressSessionId('a_b-c'.padEnd(20, 'x')), true)
  assert.strictEqual(isValidProgressSessionId('short'), false)
  assert.strictEqual(isValidProgressSessionId('x'.repeat(65)), false)
  assert.strictEqual(isValidProgressSessionId('has space here'), false)
  assert.strictEqual(isValidProgressSessionId(undefined), false)
  assert.strictEqual(isValidProgressSessionId(12345678), false)
}

function testCollectsOnlyAnsweredValidFields() {
  const answers = collectProgressAnswers(FIELDS, {
    name_1: 'Jamie',
    email_1: 'not-an-email',
    notes_1: ''
  })

  assert.deepStrictEqual(
    answers.map(answer => answer.id),
    ['name_1'],
    'invalid and empty answers are dropped instead of throwing'
  )
}

function testContactGate() {
  const withoutContact = collectProgressAnswers(FIELDS, { name_1: 'Jamie' })
  assert.strictEqual(hasContactAnswer(withoutContact), false)

  const withEmail = collectProgressAnswers(FIELDS, {
    name_1: 'Jamie',
    email_1: 'jamie@example.com'
  })
  assert.strictEqual(hasContactAnswer(withEmail), true)

  const withPhone = collectProgressAnswers(FIELDS, { phone_1: '+12125550123' })
  assert.strictEqual(hasContactAnswer(withPhone), true)
}

function testPayloadShape() {
  const answers = collectProgressAnswers(FIELDS, {
    name_1: 'Jamie',
    email_1: 'jamie@example.com'
  })
  const payload = buildProgressPayload({
    event: 'progress',
    sessionId: 'session_12345',
    form: { id: 'form_1', name: 'Intake' },
    answers,
    hiddenFields: [
      { id: 'h1', name: 'utm_source', value: 'google' },
      { id: 'h2', name: 'utm_medium', value: undefined as any }
    ],
    now: 1_700_000_000
  })

  assert.deepStrictEqual(payload, {
    event: 'progress',
    sessionId: 'session_12345',
    formId: 'form_1',
    formName: 'Intake',
    sentAt: 1_700_000_000,
    answers: [
      {
        id: 'name_1',
        title: 'Your name',
        kind: FieldKindEnum.SHORT_TEXT,
        value: 'Jamie',
        text: 'Jamie'
      },
      {
        id: 'email_1',
        title: 'Email',
        kind: FieldKindEnum.EMAIL,
        value: 'jamie@example.com',
        text: 'jamie@example.com'
      }
    ],
    hiddenFields: { utm_source: 'google' }
  })
  assert.strictEqual('submissionId' in payload, false)

  const complete = buildProgressPayload({
    event: 'complete',
    sessionId: 'session_12345',
    form: { id: 'form_1', name: 'Intake' },
    answers,
    hiddenFields: [],
    submissionId: 'sub_1',
    now: 1_700_000_001
  })
  assert.strictEqual(complete.event, 'complete')
  assert.strictEqual(complete.submissionId, 'sub_1')
}

function testChoiceAnswersCarryReadableText() {
  const fields: any[] = [
    {
      id: 'pets_1',
      title: 'Which pets?',
      kind: FieldKindEnum.MULTIPLE_CHOICE,
      validations: {},
      properties: {
        allowMultiple: true,
        choices: [
          { id: 'c_dog', label: 'Dog' },
          { id: 'c_cat', label: 'Cat' }
        ]
      }
    }
  ]
  const answers = collectProgressAnswers(fields, { pets_1: { value: ['c_dog', 'c_cat'] } })
  const payload = buildProgressPayload({
    event: 'progress',
    sessionId: 'session_12345',
    form: { id: 'form_1', name: 'Intake' },
    answers,
    hiddenFields: [],
    now: 1
  })

  assert.strictEqual(payload.answers[0].text, 'Dog, Cat')
}

function testSignature() {
  const body = '{"a":1}'
  const expected = createHmac('sha256', 'secret').update(`1700000000.${body}`).digest('hex')

  assert.strictEqual(signProgressPayload(body, 'secret', 1_700_000_000), expected)
  assert.notStrictEqual(signProgressPayload(body, 'other', 1_700_000_000), expected)
}

async function run() {
  testSessionIdValidation()
  testCollectsOnlyAnsweredValidFields()
  testContactGate()
  testPayloadShape()
  testChoiceAnswersCarryReadableText()
  testSignature()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
