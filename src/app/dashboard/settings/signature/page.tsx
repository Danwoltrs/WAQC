'use client'

/**
 * Email signature settings.
 *
 * Mirrors sys.wolthers.com's Settings > Signature tab, but with WAQC's
 * simpler model: no department picker (Groups is fixed to
 * qualitycontrol@wolthers.com) and no custom logo picker (always uses
 * the default green Wolthers logo). The "Q Grader" badge appears
 * automatically when profiles.is_q_grader is true — toggled by admin
 * via the profile editor, not from this page.
 *
 * Save flow:
 *   1. PATCH /api/profile with the four editable fields.
 *   2. Server updates the row, re-renders both signature HTML variants,
 *      stores them, and returns the fresh profile + rendered HTML.
 *   3. We refresh the preview from the server response (no client-side
 *      re-render — the server is the source of truth so what you see
 *      here is exactly what the report email will use).
 */

import { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Check, Mail } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ProfileShape {
  id: string
  full_name: string
  email: string
  is_q_grader: boolean | null
  is_master_cupper: boolean | null
  title: string | null
  phone: string | null
  whatsapp: string | null
  teams_email: string | null
  email_signature_html: string | null
  email_signature_compact_html: string | null
}

export default function SignatureSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [profile, setProfile] = useState<ProfileShape | null>(null)

  // Editable form state (mirrors profile.* but with empty-strings instead
  // of nulls so the controlled <Input> components don't warn).
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [teamsEmail, setTeamsEmail] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/profile')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (cancelled) return
        const p: ProfileShape = json.profile
        setProfile(p)
        setTitle(p.title ?? '')
        setPhone(p.phone ?? '')
        setWhatsapp(p.whatsapp ?? '')
        setTeamsEmail(p.teams_email ?? '')
      } catch (err) {
        console.error(err)
        toast({
          title: 'Could not load profile',
          variant: 'destructive',
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [toast])

  const handleSave = async () => {
    setSaving(true)
    setJustSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          teams_email: teamsEmail.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        toast({
          title: 'Save failed',
          description: data?.details || data?.error || 'Could not save signature',
          variant: 'destructive',
        })
        return
      }
      // Refresh from server so preview reflects what's actually stored.
      setProfile(data.profile)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2200)
      toast({ title: 'Signature saved' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      </MainLayout>
    )
  }

  if (!profile) {
    return (
      <MainLayout>
        <div className="p-6 text-sm text-muted-foreground">Profile not found.</div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-sm font-semibold tracking-tight">Email Signature</h1>
          <p className="text-xs text-muted-foreground">
            Used when sending reports from <span className="font-medium">qualitycontrol@wolthers.com</span>.
            Saved as HTML so it renders correctly in Outlook, Gmail, and Apple Mail.
          </p>
        </div>

        {/* Two-column: form on the left, live preview on the right.
            On narrow screens both stack vertically. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card className="rounded-[20px]">
            <CardHeader>
              <CardTitle className="text-sm">Your details</CardTitle>
              <CardDescription className="text-xs">
                {profile.full_name} · {profile.email}
                {profile.is_q_grader ? (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#556b2f]/10 text-[#556b2f]">
                    Q GRADER
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block">Title</Label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder='e.g. "Quality Director", "Senior Cupper"'
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Shows beside your name in the signature.
                </p>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">Phone</Label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+55 13 99999-0000"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Shown in the compact reply signature only.
                </p>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">WhatsApp</Label>
                <Input
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  placeholder="+55 13 99999-0000"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Builds a wa.me link. Country code required for the link to work.
                </p>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">Teams email</Label>
                <Input
                  type="email"
                  value={teamsEmail}
                  onChange={e => setTeamsEmail(e.target.value)}
                  placeholder={profile.email}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Used for the &quot;Teams Chat&quot; link. Defaults to your account email.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Groups line is fixed to <span className="font-medium">Quality Control · qualitycontrol@wolthers.com</span>.
                </span>
              </div>

              <div className="flex justify-end pt-2 border-t border-border/50">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-[#556b2f] hover:bg-[#556b2f]/90"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : justSaved ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live preview — server-rendered HTML dropped into a sandboxed
              iframe so the inline CSS doesn't bleed into the surrounding
              page (and vice versa: page CSS doesn't make the preview lie
              about how it'll look in Outlook). */}
          <Card className="rounded-[20px]">
            <CardHeader>
              <CardTitle className="text-sm">Preview</CardTitle>
              <CardDescription className="text-xs">
                Exactly what recipients will see at the end of report emails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground">Full (new emails)</Label>
                <SignaturePreviewFrame html={profile.email_signature_html} height={200} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground">Compact (replies)</Label>
                <SignaturePreviewFrame html={profile.email_signature_compact_html} height={90} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

/**
 * Sandboxed iframe rendering arbitrary signature HTML. srcDoc isolates
 * the inline CSS from the host page; the email signature uses absolute
 * font sizes (8–10pt) so the rendered output reflects what the recipient
 * will see in Outlook/Gmail.
 *
 * Null html → render a small "not generated yet" placeholder rather
 * than an empty iframe.
 */
function SignaturePreviewFrame({ html, height }: { html: string | null; height: number }) {
  if (!html) {
    return (
      <div
        className="text-xs text-muted-foreground italic flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30"
        style={{ height }}
      >
        Save your details once to generate the preview.
      </div>
    )
  }
  return (
    <iframe
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:12px;">${html}</body></html>`}
      style={{ width: '100%', height, border: '1px solid var(--border)', borderRadius: 8 }}
      sandbox=""
      title="Signature preview"
    />
  )
}
