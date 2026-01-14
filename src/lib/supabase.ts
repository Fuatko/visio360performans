import { createClient } from '@supabase/supabase-js'

// Get environment variables with proper fallback
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

const supabaseUrl = (envUrl && envUrl.length > 0 && envUrl.startsWith('http')) 
  ? envUrl.replace(/\/$/, '')
  : 'https://bwvvuyqaowbwlodxbbrl.supabase.co'

const supabaseKey = (envKey && envKey.length > 0)
  ? envKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnZ1eXFhb3did2xvZHhiYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjA5NzAsImV4cCI6MjA4MzY5Njk3MH0.BGl1qFzFsKWmr-rHRqahpIZdmds56d-KeqZ-WkJ_nwM'

export const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase
