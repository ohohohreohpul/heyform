import { BadRequestException, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'

import { SaveProgressInput } from '@graphql'
import { EndpointAnonymousIdGuard, GqlThrottlerGuard } from '@guard'
import { applyLogicToFields, flattenFields } from '@heyform-inc/answer-utils'
import { helper, hs, timestamp } from '@heyform-inc/utils'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { EndpointService, FormService, ProgressCaptureService } from '@service'
import {
  assertFormIsAcceptingSubmissions,
  buildProgressPayload,
  collectProgressAnswers,
  hasContactAnswer,
  isValidProgressSessionId,
  normalizeSubmissionHiddenFields
} from '@utils'

/** A form saves at most once per answered question; this leaves room for edits. */
const SAVE_PROGRESS_LIMIT_PER_MINUTE = 60

@Resolver()
@UseGuards(EndpointAnonymousIdGuard)
export class SaveProgressResolver {
  constructor(
    private readonly endpointService: EndpointService,
    private readonly formService: FormService,
    private readonly progressCaptureService: ProgressCaptureService
  ) {}

  /**
   * Receives a respondent's answers-so-far and forwards them to the progress
   * webhook. Returns whether anything was forwarded; `false` is normal until a
   * contact field is answered.
   */
  @Mutation(returns => Boolean)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: SAVE_PROGRESS_LIMIT_PER_MINUTE, ttl: hs('1m') } })
  async saveProgress(@Args('input') input: SaveProgressInput): Promise<boolean> {
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
}
