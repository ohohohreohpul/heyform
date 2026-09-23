import { COUNTRIES } from '@heyform-inc/form-renderer'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components'

import { useStoreContext } from '../../store'
import { RequiredSettingsProps } from './Required'

const ASK_RESPONDENT = ''

/**
 * Lets a form fix the country for address answers (e.g. a US-only service),
 * which hides the country picker from respondents.
 */
export default function Address({ field }: RequiredSettingsProps) {
  const { t } = useTranslation()
  const { dispatch } = useStoreContext()

  const options = useMemo(
    () => [{ value: ASK_RESPONDENT, label: 'form.builder.settings.askCountry' }, ...COUNTRIES],
    []
  )

  const handleChange = useCallback(
    (value: string) => {
      dispatch({
        type: 'updateField',
        payload: {
          id: field.id,
          updates: {
            properties: {
              ...field.properties,
              defaultCountryCode: value || undefined
            }
          }
        }
      })
    },
    [dispatch, field.id, field.properties]
  )

  return (
    <div className="space-y-1">
      <label className="text-sm/6" htmlFor="#">
        {t('form.builder.settings.addressCountry')}
      </label>

      <Select.Native
        className="mt-2 w-full"
        options={options}
        value={field.properties?.defaultCountryCode ?? ASK_RESPONDENT}
        multiLanguage
        onChange={handleChange}
      />
    </div>
  )
}
