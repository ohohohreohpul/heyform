import { Controller, Get, Param, Res } from '@nestjs/common'
import { Response } from 'express'

import {
  APP_HOMEPAGE_URL,
  COOKIE_DOMAIN,
  ENABLE_GOOGLE_FONTS,
  GOOGLE_RECAPTCHA_KEY,
  STRIPE_PUBLISHABLE_KEY
} from '@environments'
import { FormService } from '@service'
import { Logger, buildFormPageMeta } from '@utils'

@Controller()
export class FormController {
  private readonly logger = new Logger('FormController')

  constructor(private readonly formService: FormService) {}

  @Get('/form/:formId')
  async index(@Param('formId') formId: string, @Res() res: Response) {
    return res.render('index', {
      ...(await this.findPageMeta(formId)),
      heyform: {
        homepageURL: APP_HOMEPAGE_URL,
        websiteURL: APP_HOMEPAGE_URL,
        cookieDomain: COOKIE_DOMAIN,
        enableGoogleFonts: ENABLE_GOOGLE_FONTS,
        stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
        googleRecaptchaKey: GOOGLE_RECAPTCHA_KEY
      }
    })
  }

  /** Metadata must never block the page; an unknown or invalid id gets none. */
  private async findPageMeta(formId: string) {
    try {
      return buildFormPageMeta(await this.formService.findById(formId))
    } catch (err) {
      this.logger.error(`Unable to load form page metadata: ${(err as Error)?.message}`)
      return buildFormPageMeta(null)
    }
  }
}
