import { HiddenFieldAnswer } from '@heyform-inc/shared-types-enums'

import { axios } from '../utils/axios'

const OPEN_FORM_GQL = `query openForm($input: OpenFormInput!) {
  openForm(input: $input)
}`

const VERIFY_FORM_PASSWORD_GQL = `query verifyFormPassword($input: VerifyPasswordInput!) {
  verifyFormPassword(input: $input)
}`

const UPLOAD_FILE_TOKEN_GQL = `mutation uploadFileToken($input: UploadFormFileInput!) {
  uploadFileToken(input: $input) {
    token
    urlPrefix
    key
  }
}`

const COMPLETE_SUBMISSION_GQL = `mutation completeSubmission($input: CompleteSubmissionInput!) {
	completeSubmission(input: $input) {
	  clientSecret
	}
}`

const SAVE_PROGRESS_GQL = `mutation saveProgress($input: SaveProgressInput!) {
  saveProgress(input: $input)
}`

export class EndpointService {
  static async openForm(formId: string): Promise<string> {
    const result = await axios({
      query: OPEN_FORM_GQL,
      variables: {
        input: {
          formId
        }
      }
    })
    return result.openForm
  }

  static async verifyFormPassword(formId: string, password: string): Promise<string> {
    const result = await axios({
      query: VERIFY_FORM_PASSWORD_GQL,
      variables: {
        input: {
          formId,
          password
        }
      }
    })
    return result.verifyFormPassword
  }

  static async uploadFileToken(
    formId: string,
    filename: string,
    mime: string
  ): Promise<{
    token: string
    urlPrefix: string
    key: string
  }> {
    const result = await axios({
      query: UPLOAD_FILE_TOKEN_GQL,
      variables: {
        input: {
          formId,
          filename,
          mime
        }
      }
    })
    return result.uploadFileToken
  }

  static async completeSubmission(input: {
    formId: string
    contactId?: string
    openToken: string
    passwordToken?: string
    answers: Record<string, Any>
    hiddenFields: HiddenFieldAnswer[]
    // Google reCAPTCHA token
    recaptchaToken?: string
    partialSubmission?: boolean
    progressSessionId?: string
  }): Promise<{ clientSecret?: string }> {
    const result = await axios({
      query: COMPLETE_SUBMISSION_GQL,
      variables: {
        input
      }
    })
    return result.completeSubmission
  }

  static async saveProgress(input: {
    formId: string
    sessionId: string
    answers: Record<string, Any>
    hiddenFields: HiddenFieldAnswer[]
    openToken: string
  }): Promise<boolean> {
    const result = await axios({
      query: SAVE_PROGRESS_GQL,
      variables: {
        input
      }
    })
    return result.saveProgress
  }
}
