/**
 * Local design preview for the LovePetCare intake form (`pnpm dev`, then open
 * /preview.html). Renders the form JSON and custom CSS from /themes exactly as
 * the published form page does, but with a mock submit and no server.
 */
import {
  FormRenderer,
  getTheme,
  getThemeStyle,
  getWebFontURL,
  initI18n
} from '@heyform-inc/form-renderer/src'
import { createRoot } from 'react-dom/client'

import '@/styles/globals.scss'
import '@/styles/render.scss'

import form from '../../../../themes/lovepetcare-intake.json'
import customCSS from '../../../../themes/lovepetcare.css?raw'

const MOCK_SUBMIT_DELAY_MS = 600

initI18n('en')

function Preview() {
  const theme = getTheme(form.themeSettings.theme as any)
  const fontURL = getWebFontURL(theme.fontFamily)

  return (
    <>
      {fontURL && <link href={fontURL} rel="stylesheet" />}
      <style>{getThemeStyle(theme, {})}</style>
      <FormRenderer
        form={form as any}
        locale="en"
        alwaysShowNextButton
        enableNavigationArrows
        onSubmit={() => new Promise(resolve => setTimeout(resolve, MOCK_SUBMIT_DELAY_MS))}
        onChange={values => console.info('[preview] answers', values)}
      />
      <style>{customCSS}</style>
    </>
  )
}

createRoot(document.getElementById('heyform-render-root')!).render(<Preview />)
