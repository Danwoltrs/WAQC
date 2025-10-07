import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Database } from './supabase'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // In API routes, cookies are read-only. Cookie mutations will be handled by middleware.
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // In API routes, cookies are read-only. Cookie mutations will be handled by middleware.
          }
        },
      },
    }
  )
}
