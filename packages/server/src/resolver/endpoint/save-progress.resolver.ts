import { BadRequestException, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { createHash } from 'crypto'

import { SaveProgressInput } from '@graphql'
import { EndpointAnonymousIdGuard, GqlThrottlerGuard } from '@guard'
import { applyLogicToFields, flattenFields } from '@heyform-inc/answer-utils'
import { helper, hs, timestamp } from '@heyform-inc/utils'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { EndpointService, FormService, ProgressCaptureService, RedisService } from '@service'
import {
  ClientInfo,
  GqlClient,
  OPEN_FORM_TOKEN_MAX_AGE_SECONDS,
  assertFormIsAcceptingSubmissions,
  buildProgressPayload,
  collectProgressAnswers,
  hasContactAnswer,
  isValidProgressSessionId,
  normalizeSubmissionHiddenFields
} from '@utils'

/** A form saves at most once per answered question; this leaves room for edits. */
const SAVE_PROGRESS_LIMIT_PER_MINUTE = 60

/**
 * Every new progress session becomes a CRM lead, so cap how many one IP can
 * start. Real visitors fill in one form; this only bites scripted abuse.
 */
const MAX_NEW_SESSIONS_PER_IP = 10
const NEW_SESSION_WINDOW = '1h'
const SESSION_BINDING_TTL = `${OPEN_FORM_TOKEN_MAX_AGE_SECONDS}s`

function sessionBindingKey(openToken: string): string {
  return `progress:token:${createHash('sha256').update(openToken).digest('hex')}`
}

@Resolver()
@UseGuards(EndpointAnonymousIdGuard)
export class SaveProgressResolver {
  constructor(
    private readonly endpointService: EndpointService,
    private readonly formService: FormService,
    private readonly progressCaptureService: ProgressCaptureService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Receives a respondent's answers-so-far and forwards them to the progress
   * webhook. Returns whether anything was forwarded; `false` is normal until a
   * contact field is answered.
   */
  @Mutation(returns => Boolean)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: SAVE_PROGRESS_LIMIT_PER_MINUTE, ttl: hs('1m') } })
  async saveProgress(
    @GqlClient() client: ClientInfo,
    @Args('input') input: SaveProgressInput
  ): Promise<boolean> {
    if (!isValidProgressSessionId(input.sessionId)) {
      throw new BadRequestException('Invalid progress session')
    }

    const form = await this.formService.findById(input.formId)

    if (!form || form.suspended || form.settings?.active !== true) {
      throw new BadRequestException('The form is not accepting submissions')
    }

    const now = timestamp()
    assertFormIsAcceptingSubmissions(form.settings, now)

    const openToken = this.endpointService.decryptToken(input.openToken)
    this.endpointService.assertOpenToken(openToken, input.formId, form.settings, now)

    if (!this.progressCaptureService.isEnabled || helper.isEmpty(form.fields)) {
      return false
    }

    const { fields } = applyLogicToFields(
      flattenFields(form.fields, true),
      form.logics,
      form.variables,
      input.answers || {}
    )
    const answers = collectProgressAnswers(fields, input.answers || {})

    if (!hasContactAnswer(answers)) {
      return false
    }

    if (!(await this.claimSession(input.openToken, input.sessionId, client.ip))) {
      return false
    }

    return this.progressCaptureService.send(
      buildProgressPayload({
        event: 'progress',
        sessionId: input.sessionId,
        form,
        answers,
        hiddenFields: normalizeSubmissionHiddenFields(form.hiddenFields, input.hiddenFields),
        now
      })
    )
  }

  /**
   * Binds the form visit (open token) to a single progress session, so one
   * token cannot be replayed to mint many leads, and counts each new session
   * against the visitor's IP. Returns false once the IP is over its limit.
   */
  private async claimSession(openToken: string, sessionId: string, ip: string): Promise<boolean> {
    const key = sessionBindingKey(openToken)
    const boundSessionId = await this.redisService.get(key)

    if (boundSessionId) {
      return this.assertSameSession(boundSessionId, sessionId)
    }

    const sessionsFromIp = await this.redisService.incrementWithExpiry(
      `progress:ip:${ip}`,
      NEW_SESSION_WINDOW
    )

    if (sessionsFromIp > MAX_NEW_SESSIONS_PER_IP) {
      return false
    }

    if (await this.redisService.setIfAbsent(key, sessionId, SESSION_BINDING_TTL)) {
      return true
    }

    // Another request bound this token first; accept only the same session.
    return this.assertSameSession(await this.redisService.get(key), sessionId)
  }

  private assertSameSession(boundSessionId: string | null, sessionId: string): true {
    if (boundSessionId !== sessionId) {
      throw new BadRequestException('Invalid progress session')
    }
    return true
  }
}
