import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://bwvvuyqaowbwlodxbbrl.supabase.co').replace(/\/$/, '')
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnZ1eXFhb3did2xvZHhiYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjA5NzAsImV4cCI6MjA4MzY5Njk3MH0.BGl1qFzFsKWmr-rHRqahpIZdmds56d-KeqZ-WkJ_nwM'

if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
  throw new Error('Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase
