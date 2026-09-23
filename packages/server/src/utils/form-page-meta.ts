import { FormModel } from '@heyform-inc/shared-types-enums'

import { helper } from '@heyform-inc/utils'

export interface FormPageMeta {
  title: string
  description?: string
  image?: string
}

/**
 * Server-rendered <title> and social preview tags for a public form page, so
 * shared links show the form's own name rather than the software's.
 */
export function buildFormPageMeta(
  form: Pick<FormModel, 'name' | 'settings'> | null | undefined
): FormPageMeta {
  const settings = form?.settings

  return {
    title: settings?.metaTitle || form?.name || '',
    description: helper.isValid(settings?.metaDescription) ? settings!.metaDescription : undefined,
    image: helper.isValid(settings?.metaOGImageUrl) ? settings!.metaOGImageUrl : undefined
  }
}
