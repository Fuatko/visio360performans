import { createClient } from '@supabase/supabase-js'

// Client-side Supabase: Keep legacy fallback for now to avoid breaking production while migrating env.
// To enforce env-only mode (recommended for KVKK/production), set:
// - NEXT_PUBLIC_SUPABASE_URL
// - NEXT_PUBLIC_SUPABASE_ANON_KEY
// - NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK=1
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

const disableFallback = process.env.NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK === '1'

const fallbackUrl = 'https://bwvvuyqaowbwlodxbbrl.supabase.co'
const fallbackAnon =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnZ1eXFhb3did2xvZHhiYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjA5NzAsImV4cCI6MjA4MzY5Njk3MH0.BGl1qFzFsKWmr-rHRqahpIZdmds56d-KeqZ-WkJ_nwM'

const supabaseUrl =
  envUrl && envUrl.length > 0 && envUrl.startsWith('http')
    ? envUrl.replace(/\/$/, '')
    : disableFallback
      ? ''
      : fallbackUrl

const supabaseKey =
  envKey && envKey.length > 0
    ? envKey
    : disableFallback
      ? ''
      : fallbackAnon

if (disableFallback && (!supabaseUrl || !supabaseKey)) {
  // Fail loudly in the browser console if misconfigured.
  // This prevents silently using old fallback keys in production.
  // eslint-disable-next-line no-console
  console.error('Supabase env eksik: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY gerekli.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase
