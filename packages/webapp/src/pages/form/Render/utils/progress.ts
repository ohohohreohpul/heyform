import { HiddenField, HiddenFieldAnswer } from '@heyform-inc/shared-types-enums'
import { useCallback, useEffect, useRef } from 'react'

import { EndpointService } from '../service/endpoint'
import { helper, nanoid } from '@heyform-inc/utils'

/** Wait for a pause in typing before saving, so one answer means one request. */
const SAVE_DEBOUNCE_MS = 1_500
const SESSION_ID_LENGTH = 21

interface ProgressCaptureOptions {
  formId: string
  getOpenToken: () => string
  getHiddenFields: () => HiddenFieldAnswer[]
}

function isFileValue(value: unknown): boolean {
  return (
    (typeof File !== 'undefined' && value instanceof File) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  )
}

/** Files are only uploaded on submit, so they are left out of progress saves. */
function withoutFiles(values: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isFileValue(value)))
}

export function queryToHiddenFields(
  hiddenFields: HiddenField[] = [],
  query: Record<string, any>
): HiddenFieldAnswer[] {
  return hiddenFields
    .filter(field => helper.isValid(query[field.name]))
    .map(field => ({ ...field, value: query[field.name] }))
}

/**
 * Saves the respondent's answers-so-far to the server while they fill in the
 * form. The server only forwards them once a contact field is answered, and
 * silently ignores saves when progress capture is not configured.
 */
export function useProgressCapture({
  formId,
  getOpenToken,
  getHiddenFields
}: ProgressCaptureOptions) {
  const sessionIdRef = useRef(nanoid(SESSION_ID_LENGTH))
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingRef = useRef<Record<string, any> | null>(null)
  const isStoppedRef = useRef(false)

  const save = useCallback(
    async (values: Record<string, any>) => {
      const openToken = getOpenToken()

      if (isStoppedRef.current || !openToken || helper.isEmpty(values)) {
        return
      }

      try {
        await EndpointService.saveProgress({
          formId,
          sessionId: sessionIdRef.current,
          answers: withoutFiles(values),
          hiddenFields: getHiddenFields(),
          openToken
        })
      } catch (err) {
        // Progress saves are best-effort; the final submission is unaffected.
        console.warn('Unable to save form progress', err)
      }
    },
    [formId, getOpenToken, getHiddenFields]
  )

  const flush = useCallback(() => {
    clearTimeout(timerRef.current)

    if (pendingRef.current) {
      const values = pendingRef.current
      pendingRef.current = null
      save(values)
    }
  }, [save])

  const handleChange = useCallback(
    (values: Record<string, any>) => {
      pendingRef.current = values
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS)
    },
    [flush]
  )

  /** Called once the form is submitted so no stale save lands afterwards. */
  const stop = useCallback(() => {
    isStoppedRef.current = true
    pendingRef.current = null
    clearTimeout(timerRef.current)
  }, [])

  // Most abandonment is a tab switch or the phone going to the home screen;
  // save immediately then instead of waiting out the debounce.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearTimeout(timerRef.current)
    }
  }, [flush])

  return { sessionId: sessionIdRef.current, handleChange, stop }
}
