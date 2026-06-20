#!/usr/bin/env node
/**
 * Ayşegül KAZMAZ — genel OUT → okul_yasam (Okul İçi Yaşam Koordinatörü grubu)
 *
 *   node scripts/fix-aysegul-genel-to-okul-yasam.mjs
 *   node scripts/fix-aysegul-genel-to-okul-yasam.mjs --apply
 */
import { getSupabaseClient } from './_load-env.mjs'

const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const APPLY = process.argv.includes('--apply')

async function main() {
  const sb = await getSupabaseClient()
  const { data: ay } = await sb.from('users').select('id, name').eq('name', 'Ayşegül KAZMAZ').maybeSingle()
  if (!ay) throw new Error('Ayşegül KAZMAZ bulunamadı')

  const { data: genelRows } = await sb
    .from('evaluation_assignments')
    .select('id, status, target:target_id(name)')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'genel')

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log('Ayşegül genel atama:', genelRows?.length || 0)
  console.log('Örnek:', (genelRows || []).slice(0, 5).map((r) => `${r.target?.name} (${r.status})`))

  const { count: oyBefore } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'okul_yasam')
  console.log('Mevcut okul_yasam:', oyBefore ?? 0)

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/fix-aysegul-genel-to-okul-yasam.mjs --apply')
    console.log('SQL: sql/fix-aysegul-genel-to-okul-yasam.sql')
    return
  }

  if (!genelRows?.length) {
    console.log('Genel atama yok — yalnızca eski genel kapsam temizliği')
    await sb
      .from('evaluation_period_evaluator_target_categories')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ay.id)
      .eq('matrix_context', 'genel')
    await sb
      .from('evaluation_period_evaluator_target_scope')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ay.id)
      .eq('matrix_context', 'genel')
    const { count: oyAfter } = await sb
      .from('evaluation_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ay.id)
      .eq('matrix_context', 'okul_yasam')
    console.log('\nTemizlik tamam. okul_yasam atama:', oyAfter)
    return
  }

  const { error: uErr } = await sb
    .from('evaluation_assignments')
    .update({ matrix_context: 'okul_yasam' })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'genel')
  if (uErr) throw uErr

  const { data: scopes } = await sb
    .from('evaluation_period_evaluator_target_scope')
    .select('*')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'genel')

  for (const s of scopes || []) {
    const { data: existing } = await sb
      .from('evaluation_period_evaluator_target_scope')
      .select('id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ay.id)
      .eq('target_id', s.target_id)
      .eq('matrix_context', 'okul_yasam')
      .maybeSingle()
    if (existing) continue
    const { error } = await sb.from('evaluation_period_evaluator_target_scope').insert({
        period_id: PERIOD,
        evaluator_id: ay.id,
        target_id: s.target_id,
        matrix_context: 'okul_yasam',
        restrict_period: s.restrict_period,
        duty_mode: s.duty_mode,
        duty_package_ids: s.duty_package_ids || [],
        updated_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  const { data: cats } = await sb
    .from('evaluation_period_evaluator_target_categories')
    .select('*')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'genel')
    .eq('is_active', true)

  for (const c of cats || []) {
    const { data: existing } = await sb
      .from('evaluation_period_evaluator_target_categories')
      .select('id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ay.id)
      .eq('target_id', c.target_id)
      .eq('matrix_context', 'okul_yasam')
      .eq('category_id', c.category_id)
      .eq('scope_kind', c.scope_kind)
      .maybeSingle()
    if (existing) continue
    const { error: insErr } = await sb.from('evaluation_period_evaluator_target_categories').insert({
        period_id: PERIOD,
        evaluator_id: ay.id,
        target_id: c.target_id,
        matrix_context: 'okul_yasam',
        category_id: c.category_id,
        scope_kind: c.scope_kind,
        is_active: true,
    })
    if (insErr) throw insErr
  }

  await sb
    .from('evaluation_period_evaluator_target_categories')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'genel')

  await sb
    .from('evaluation_period_evaluator_target_scope')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'genel')

  const { count: oyAfter } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'okul_yasam')
  const { count: genelAfter } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ay.id)
    .eq('matrix_context', 'genel')

  console.log('\nTamam. okul_yasam:', oyAfter, 'genel:', genelAfter)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
