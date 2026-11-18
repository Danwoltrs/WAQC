import { describe, expect, it } from 'vitest'
import { composeBodyHtml, renderMarkupBodyHtml, stripTrailingClosing } from './compose-html'
import { stripDraftMarkup } from './draft-markup'

const INPUT = '**Hello** ==world=={red}x{/red}'

describe('renderMarkupBodyHtml', () => {
  it('renders bold, highlight and colour inside a Helvetica 10pt wrapper', () => {
    const html = renderMarkupBodyHtml(INPUT, null)
    expect(html).toContain('<strong>')
    expect(html).toContain('#fff3a3')
    expect(html).toContain('color:#c0392b')
    expect(html.startsWith('<div style="font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a1a;">')).toBe(true)
  })

  it('strips a trailing Best regards line when a signature is attached, and glues the signature', () => {
    const html = renderMarkupBodyHtml('Hi there\n\nBest regards,', '<table>sig</table>')
    expect(html).not.toContain('Best regards')
    expect(html).toContain('Hi there')
    expect(html.endsWith('<br/><table>sig</table>')).toBe(true)
  })

  it('paragraphs use WAQC font, never the sys Calibri 11pt style', () => {
    const html = renderMarkupBodyHtml('One\n\nTwo **b**', null)
    expect(html).not.toContain('Calibri')
    expect(html).not.toContain('11pt')
    expect(html).toContain('font-family:Helvetica,Arial,sans-serif;font-size:10pt;color:#1a1a1a;')
  })

  it('strips the closing with name, company and email lines under it', () => {
    const html = renderMarkupBodyHtml('Hi\n\nBest regards,\nDaniel Wolthers\nWolthers & Associates\nd@wolthers.com', '<i>sig</i>')
    expect(html).not.toContain('Best regards')
    expect(html).not.toContain('Daniel')
  })

  it('keeps text typed under the closing', () => {
    const html = renderMarkupBodyHtml('Hi\n\nBest regards,\nP.S. the vessel changed.', '<i>sig</i>')
    expect(html).toContain('Best regards')
    expect(html).toContain('P.S. the vessel changed.')
  })

  it('keeps the closing when there is no signature', () => {
    expect(renderMarkupBodyHtml('Hi\n\nBest regards,', null)).toContain('Best regards')
  })

  it('stripDraftMarkup of the same input is plain text', () => {
    expect(stripDraftMarkup(INPUT)).toBe('Hello worldx')
  })
})

describe('existing exports are unchanged', () => {
  it('stripTrailingClosing and composeBodyHtml', () => {
    expect(stripTrailingClosing('Hi\n\nBest regards,\nDaniel')).toBe('Hi')
    expect(composeBodyHtml('a\nb', null)).toContain('a<br/>b')
  })
})
