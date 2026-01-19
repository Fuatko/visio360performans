import { createClient } from '@supabase/supabase-js'

// Client-side Supabase (KVKK):
// - No hardcoded fallback keys are allowed in the repo.
// - You MUST set:
//   - NEXT_PUBLIC_SUPABASE_URL
//   - NEXT_PUBLIC_SUPABASE_ANON_KEY
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

const supabaseUrl = envUrl && envUrl.startsWith('http') ? envUrl.replace(/\/$/, '') : ''
const supabaseKey = envKey && envKey.length > 0 ? envKey : ''

if (!supabaseUrl || !supabaseKey) {
  // eslint-disable-next-line no-console
  console.error('Supabase env eksik: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY gerekli.')
}

// Important:
// - We MUST NOT ship hardcoded real project keys.
// - But we also must avoid crashing SSR/build when env is missing.
// So: if env is missing, use a non-secret placeholder. Calls will fail at runtime,
// and the console error above will point to the configuration issue.
const url = supabaseUrl || 'https://placeholder.supabase.co'
const key = supabaseKey || 'public-anon-key'

export const supabase = createClient(url, key)

export default supabase
