import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Bir anket + iç kullanıcı için etkin (atanmış) soru id kümesini hesaplar.
 *
 * Etkin küme = (atanmış başlıkların soruları) ∪ (tekil eklenen sorular).
 *
 * Dönüş:
 *  - { restricted: false } → kullanıcının bu ankette ataması yok; TÜM sorular gösterilir
 *    (mevcut davranış korunur, geriye dönük uyumlu). Atama tabloları henüz migrate
 *    edilmemişse de bu durum döner (özellik pasif).
 *  - { restricted: true, questionIds } → yalnızca bu id'lerdeki sorular gösterilir.
 */
export async function getAssignedQuestionIds(
  supabase: SupabaseClient,
  surveyId: string,
  userId: string | null | undefined
): Promise<{ restricted: false } | { restricted: true; questionIds: Set<string> }> {
  if (!userId) return { restricted: false }

  // Atama başlığı
  const assignmentRes = await supabase
    .from('survey_assignments')
    .select('id, status')
    .eq('survey_id', surveyId)
    .eq('user_id', userId)
    .maybeSingle()

  // Tablo yoksa (42P01) veya başka hata → kısıtlama yok (özellik pasif / kullanıcı atanmamış)
  if (assignmentRes.error) return { restricted: false }
  const assignment = assignmentRes.data as { id: string; status: string } | null
  if (!assignment || assignment.status === 'cancelled') return { restricted: false }

  const [catRes, qRes] = await Promise.all([
    supabase.from('survey_assignment_categories').select('category').eq('assignment_id', assignment.id),
    supabase.from('survey_assignment_questions').select('question_id').eq('assignment_id', assignment.id),
  ])

  const assignedCategories = new Set<string>(
    ((catRes.data || []) as Array<{ category: string }>).map((r) => String(r.category))
  )
  const ids = new Set<string>(
    ((qRes.data || []) as Array<{ question_id: string }>).map((r) => String(r.question_id))
  )

  // Başlığa göre soruları ekle
  if (assignedCategories.size) {
    const { data: catQuestions } = await supabase
      .from('survey_questions')
      .select('id, category')
      .eq('survey_id', surveyId)
    for (const q of (catQuestions || []) as Array<{ id: string; category: string | null }>) {
      if (q.category != null && assignedCategories.has(String(q.category))) ids.add(String(q.id))
    }
  }

  return { restricted: true, questionIds: ids }
}
