import type { SupabaseClient } from '@supabase/supabase-js'

const RESPONSES_IN_CHUNK = 100

/** PostgREST URL limit — assignment_id listesini parçalı çek. */
export async function fetchEvaluationResponsesInChunks(
  supabase: SupabaseClient,
  assignmentIds: string[]
): Promise<{ responses: any[]; error: string | null }> {
  const ids = assignmentIds.filter(Boolean)
  if (!ids.length) return { responses: [], error: null }

  const responses: any[] = []
  for (let off = 0; off < ids.length; off += RESPONSES_IN_CHUNK) {
    const chunk = ids.slice(off, off + RESPONSES_IN_CHUNK)
    const { data: part, error } = await supabase.from('evaluation_responses').select('*').in('assignment_id', chunk)
    if (error) return { responses: [], error: error.message || 'Failed to load responses' }
    responses.push(...(part || []))
  }
  return { responses, error: null }
}
