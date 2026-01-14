import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bwvvuyqaowbwlodxbbrl.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnZ1eXFhb3did2xvZHhiYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjA5NzAsImV4cCI6MjA4MzY5Njk3MH0.BGl1qFzFsKWmr-rHRqahpIZdmds56d-KeqZ-WkJ_nwM'

export const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase
