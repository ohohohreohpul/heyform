import { Injectable } from '@nestjs/common'
import got from 'got'

import { PROGRESS_WEBHOOK_SECRET, PROGRESS_WEBHOOK_URL } from '@environments'
import { timestamp } from '@heyform-inc/utils'
import { Logger, ProgressPayload, assertSafeOutboundRequest, signProgressPayload } from '@utils'

const REQUEST_TIMEOUT_MS = 8_000

@Injectable()
export class ProgressCaptureService {
  private readonly logger = new Logger('ProgressCaptureService')

  get isEnabled(): boolean {
    return Boolean(PROGRESS_WEBHOOK_URL && PROGRESS_WEBHOOK_SECRET)
  }

  /**
   * Delivers a payload to the progress webhook. Never throws: a failed delivery
   * must not interrupt the respondent. Logs carry the form and event only,
   * never answer data.
   */
  async send(payload: ProgressPayload): Promise<boolean> {
    if (!this.isEnabled) {
      return false
    }

    try {
      const { url, lookup } = await assertSafeOutboundRequest(PROGRESS_WEBHOOK_URL)
      const body = JSON.stringify(payload)
      const sentAt = timestamp()

      await got.post(url.toString(), {
        body,
        lookup,
        followRedirect: false,
        retry: 0,
        timeout: { request: REQUEST_TIMEOUT_MS },
        headers: {
          'content-type': 'application/json',
          'x-heyform-timestamp': String(sentAt),
          'x-heyform-signature': signProgressPayload(body, PROGRESS_WEBHOOK_SECRET, sentAt)
        }
      })

      return true
    } catch (err) {
      const failure = err as { code?: string; response?: { statusCode?: number } }
      const reason = failure?.code || failure?.response?.statusCode || 'unknown'

      this.logger.error(
        `Progress webhook delivery failed (form=${payload.formId}, event=${payload.event}): ${reason}`
      )
      return false
    }
  }
}
