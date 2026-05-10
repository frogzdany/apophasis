// Visitor-registration dialog.
//
// Mounts as a modal overlay before the user can interact with Lucy. The
// gating happens via the `visitor` slot in zustand — populated from
// localStorage on init, set after a successful POST to /api/visitor.
// The dialog renders the hero screenshot from docs/, the AI Tinkerers
// context, the three fields (Name + Email required, LinkedIn optional)
// and a Comenzar / Start button. Submission runs reCAPTCHA v3 with
// action="visitor_register" and POSTs the token alongside the form
// data.
//
// Layout:
//   sm  → single column, screenshot up top, fields below.
//   md+ → two columns, screenshot left, fields right.
//
// The backdrop blurs the existing 3D canvas underneath so the
// iridescent ambience stays visible behind the form.

import { Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import heroSrc from '@/assets/apophasis-lucy.jpg'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/hooks/useT'
import { type Language, t } from '@/lib/messages'
import { executeRecaptcha } from '@/lib/recaptcha'
import { useStore } from '@/store'

const RECAPTCHA_ACTION = 'visitor_register'

interface VisitorPayload {
  name: string
  email: string
  linkedin?: string
  recaptchaToken?: string
}

async function submitVisitor(
  payload: VisitorPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/visitor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let body: { ok?: boolean; error?: string } = {}
    try {
      body = (await res.json()) as typeof body
    } catch {
      /* response had no JSON body */
    }
    if (res.ok && body.ok) return { ok: true }
    return { ok: false, error: body.error ?? 'network' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

function errorKey(code: string, language: Language): string {
  const key = `visitor.error.${code}`
  // Falls back gracefully if a server error code doesn't have a localised
  // string yet; t() returns the key itself in that case.
  return t(language, key)
}

export function VisitorDialog() {
  const visitor = useStore((s) => s.visitor)
  const setVisitor = useStore((s) => s.setVisitor)
  const language = useStore((s) => s.language)
  const { t: tt } = useT()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (visitor) return null

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)

    // Run reCAPTCHA. When the site key isn't configured (dev / preview)
    // we still let the user through — the server's verify will reject
    // missing tokens in prod, so this fallback can't bypass the prod gate.
    const recaptcha = await executeRecaptcha(RECAPTCHA_ACTION)
    let recaptchaToken: string | undefined
    if (recaptcha.ok) {
      recaptchaToken = recaptcha.token
    } else if (recaptcha.reason !== 'site_key_missing') {
      setSubmitting(false)
      setError(errorKey('recaptcha_failed', language))
      return
    }

    const payload: VisitorPayload = {
      name: name.trim(),
      email: email.trim(),
      ...(linkedin.trim() ? { linkedin: linkedin.trim() } : {}),
      ...(recaptchaToken ? { recaptchaToken } : {}),
    }
    const result = await submitVisitor(payload)
    setSubmitting(false)
    if (result.ok) {
      setVisitor({
        name: payload.name,
        email: payload.email,
        ...(payload.linkedin ? { linkedin: payload.linkedin } : {}),
        submittedAt: new Date().toISOString(),
      })
      return
    }
    setError(errorKey(result.error, language))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="visitor-dialog-title"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-2xl"
    >
      <div className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-background/85 shadow-2xl backdrop-blur-xl md:flex-row md:max-h-[90vh]">
        {/* Hero column */}
        <div className="relative flex shrink-0 flex-col gap-3 bg-black/40 p-5 md:w-[44%] md:p-6">
          <Badge
            variant="secondary"
            className="self-start font-mono text-[10px] uppercase tracking-widest"
          >
            <Sparkles className="size-3" /> {tt('visitor.badge')}
          </Badge>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {/* biome-ignore lint/performance/noImgElement: vanilla Vite, not Next.js */}
            <img
              src={heroSrc}
              alt="Apophasis — Lucy mid-listen"
              className="h-44 w-full object-cover md:h-72"
              loading="eager"
            />
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">{tt('visitor.subtitle')}</p>
        </div>

        {/* Form column */}
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 md:p-6"
        >
          <div className="space-y-1">
            <h2 id="visitor-dialog-title" className="font-semibold text-lg text-white">
              {tt('visitor.title')}
            </h2>
            <p className="text-muted-foreground text-xs leading-relaxed">{tt('visitor.context')}</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="visitor-name" className="text-xs">
                {tt('visitor.field.name')}
              </Label>
              <Input
                id="visitor-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tt('visitor.field.namePlaceholder')}
                autoComplete="name"
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visitor-email" className="text-xs">
                {tt('visitor.field.email')}
              </Label>
              <Input
                id="visitor-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tt('visitor.field.emailPlaceholder')}
                autoComplete="email"
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visitor-linkedin" className="text-xs">
                {tt('visitor.field.linkedin')}
              </Label>
              <Input
                id="visitor-linkedin"
                type="url"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder={tt('visitor.field.linkedinPlaceholder')}
                autoComplete="url"
                disabled={submitting}
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs"
            >
              {error}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-2">
            <Button type="submit" size="lg" disabled={submitting} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {tt('visitor.submitting')}
                </>
              ) : (
                tt('visitor.submit')
              )}
            </Button>
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 leading-snug">
              <ShieldCheck className="size-3 shrink-0" />
              {tt('visitor.fineprint')}
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
