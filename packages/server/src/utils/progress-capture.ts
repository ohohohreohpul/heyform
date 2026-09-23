import {
  Answer,
  FieldKindEnum,
  FormField,
  HiddenFieldAnswer
} from '@heyform-inc/shared-types-enums'
import { createHmac } from 'crypto'

import { fieldValuesToAnswers } from '@heyform-inc/answer-utils'
import { helper } from '@heyform-inc/utils'

/**
 * Progress capture sends a respondent's answers-so-far to a configured webhook
 * while they are still filling in the form, so abandoned forms still produce a
 * lead. Payloads are only sent once a contact field (email or phone) holds a
 * valid answer, so every captured lead is someone who can be followed up.
 */

export type ProgressEvent = 'progress' | 'complete'

export interface ProgressAnswer {
  id: string
  title: string
  kind: FieldKindEnum
  value: any
}

export interface ProgressPayload {
  event: ProgressEvent
  sessionId: string
  formId: string
  formName: string
  sentAt: number
  answers: ProgressAnswer[]
  hiddenFields: Record<string, string>
  submissionId?: string
}

interface BuildProgressPayloadOptions {
  event: ProgressEvent
  sessionId: string
  form: { id?: string; name?: string }
  answers: Answer[]
  hiddenFields: HiddenFieldAnswer[]
  now: number
  submissionId?: string
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const CONTACT_FIELD_KINDS: FieldKindEnum[] = [FieldKindEnum.EMAIL, FieldKindEnum.PHONE_NUMBER]

export function isValidProgressSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId)
}

/**
 * Converts raw renderer values into validated answers. Only fields the
 * respondent has actually answered are considered, and any value that fails
 * validation is dropped rather than rejecting the whole payload.
 */
export function collectProgressAnswers(fields: FormField[], values: Record<string, any>): Answer[] {
  const answeredFields = fields.filter(field => helper.isValid(values?.[field.id]))

  return fieldValuesToAnswers(answeredFields, values, true)
}

export function hasContactAnswer(answers: Answer[]): boolean {
  return answers.some(
    answer => CONTACT_FIELD_KINDS.includes(answer.kind) && helper.isValid(answer.value)
  )
}

function toHiddenFieldMap(hiddenFields: HiddenFieldAnswer[]): Record<string, string> {
  return (hiddenFields || []).reduce<Record<string, string>>((map, field) => {
    if (helper.isValid(field?.name) && helper.isValid(field?.value)) {
      return { ...map, [field.name]: String(field.value) }
    }
    return map
  }, {})
}

export function buildProgressPayload(options: BuildProgressPayloadOptions): ProgressPayload {
  const payload: ProgressPayload = {
    event: options.event,
    sessionId: options.sessionId,
    formId: options.form.id ?? '',
    formName: options.form.name ?? '',
    sentAt: options.now,
    answers: options.answers.map(({ id, title, kind, value }) => ({ id, title, kind, value })),
    hiddenFields: toHiddenFieldMap(options.hiddenFields)
  }

  return options.submissionId ? { ...payload, submissionId: options.submissionId } : payload
}

/** HMAC-SHA256 over `${timestamp}.${body}` so receivers can reject replays. */
export function signProgressPayload(body: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}
