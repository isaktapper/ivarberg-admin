'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Banner } from '@/components/ui/states'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      router.push('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(/invalid login credentials/i.test(msg) ? 'Fel e-post eller lösenord.' : msg || 'Kunde inte logga in. Försök igen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sand px-4 py-10">
      <main className="w-full max-w-sm rounded-[16px] border border-line bg-white p-8 shadow-[var(--shadow-pop)]">
        <div className="mb-7 flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Group 31 (1).png" alt="iVarberg" className="h-8 w-auto" />
          <h1 className="font-display text-xl font-semibold text-ink">Logga in i adminen</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="E-post" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@exempel.se" />
          </Field>
          <Field label="Lösenord" htmlFor="password">
            <div className="relative">
              <Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button
                type="button"
                aria-label={showPassword ? 'Dölj lösenord' : 'Visa lösenord'}
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted hover:bg-stone hover:text-ink"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>

          {error ? <Banner tone="bad">{error}</Banner> : null}

          <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
            {loading ? 'Loggar in…' : <><LogIn /> Logga in</>}
          </Button>
        </form>
      </main>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">iVarberg · admin</p>
    </div>
  )
}
