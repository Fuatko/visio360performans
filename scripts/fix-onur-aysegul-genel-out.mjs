#!/usr/bin/env node
/**
 * Onur & Ayşegül — genel OUT (öğretmen değerlendirme) düzeltmesi
 *
 * - 8 kategori kapsamı (kilitli model; Mesleki Gelişim yok)
 * - Onur eksik genel atamaları (Ayşegül listesiyle hizala)
 * - Yanlış tamamlanmış formları pending yap (yedek alınır)
 *
 * DOKUNULMAZ: yasam_koordinatoru (9 soru), MD→Onur/Ayşegül genel 5 kategori
 *
 *   node scripts/fix-onur-aysegul-genel-out.mjs
 *   node scripts/fix-onur-aysegul-genel-out.mjs --apply
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSupabaseClient } from './_load-env.mjs'

const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const EVALUATORS = ['Onur ERMAN', 'Ayşegül KAZMAZ']
const APPLY = process.argv.includes('--apply')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const BEKLENEN8 = [
  'Mesleki Sorumluluk',
  'Pedagojik Yetkinlik',
  'Ölçme ve Değerlendirme',
  'Teknolojik Yetkinlikler',
  'Veli İletişimi',
  'Öğrenci İlişkileri ve Empati',
  'Proje, Etkinlik ve Kurumsal Katkı',
  'Kurum İçi İletişim ve İşbirliği',
]

async function resolveCategoryIds(sb) {
  const { data: cats, error } = await sb
    .from('evaluation_period_categories_snapshot')
    .select('id, name')
    .eq('period_id', PERIOD)
  if (error) throw error

  const ids = []
  for (const wanted of BEKLENEN8) {
    const hit = (cats || []).find((c) => {
      const n = String(c.name || '')
      if (n === wanted) return true
      if (wanted.startsWith('Pedagojik') && n.toLowerCase().startsWith('pedagojik')) return true
      if (wanted.startsWith('Ölçme') && (n.includes('Ölçme') || n.toLowerCase().includes('olcme'))) return true
      if (wanted.startsWith('Kurum İçi') && n.includes('Kurum') && n.includes('İletişim')) return true
      if (wanted.startsWith('Proje') && n.startsWith('Proje')) return true
      return false
    })
    if (!hit) throw new Error(`Kategori bulunamadı: ${wanted}`)
    ids.push(String(hit.id))
  }
  if (ids.length !== 8) throw new Error(`8 kategori bekleniyor, ${ids.length} bulundu`)
  return ids
}

async function applyEightCategoryScope(sb, evaluatorId, targetId, categoryIds) {
  await sb.from('evaluation_period_evaluator_target_scope').upsert(
    {
      period_id: PERIOD,
      evaluator_id: evaluatorId,
      target_id: targetId,
      matrix_context: 'genel',
      restrict_period: true,
      duty_mode: 'none',
      duty_package_ids: [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period_id,evaluator_id,target_id,matrix_context' }
  )

  await sb
    .from('evaluation_period_evaluator_target_categories')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', evaluatorId)
    .eq('target_id', targetId)
    .eq('matrix_context', 'genel')
    .eq('scope_kind', 'period')

  const { error } = await sb.from('evaluation_period_evaluator_target_categories').insert(
    categoryIds.map((category_id) => ({
      period_id: PERIOD,
      evaluator_id: evaluatorId,
      target_id: targetId,
      matrix_context: 'genel',
      category_id,
      scope_kind: 'period',
      is_active: true,
    }))
  )
  if (error) throw error
}

async function main() {
  const sb = await getSupabaseClient()

  const { data: users, error: uErr } = await sb.from('users').select('id, name').in('name', EVALUATORS)
  if (uErr) throw uErr
  const evBy = new Map((users || []).map((u) => [u.name, u.id]))
  for (const n of EVALUATORS) {
    if (!evBy.has(n)) throw new Error(`Kullanıcı yok: ${n}`)
  }

  const categoryIds = await resolveCategoryIds(sb)
  const { data: catNames } = await sb
    .from('evaluation_period_categories_snapshot')
    .select('id, name')
    .in('id', categoryIds)
  console.log('8 kategori:', (catNames || []).map((c) => c.name).join(' | '))

  const aysegulId = evBy.get('Ayşegül KAZMAZ')
  const onurId = evBy.get('Onur ERMAN')

  const { data: aysegulGenel } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', aysegulId)
    .eq('matrix_context', 'genel')

  const { data: onurGenel } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', onurId)
    .eq('matrix_context', 'genel')

  const aysegulTargets = new Set((aysegulGenel || []).map((r) => String(r.target_id)))
  const onurTargets = new Set((onurGenel || []).map((r) => String(r.target_id)))
  const missingForOnur = [...aysegulTargets].filter((id) => !onurTargets.has(id))

  console.log(`\nAyşegül genel hedef: ${aysegulTargets.size}`)
  console.log(`Onur genel hedef: ${onurTargets.size}`)
  console.log(`Onur'a eklenecek: ${missingForOnur.length}`)

  const pairs = []
  for (const name of EVALUATORS) {
    const eid = evBy.get(name)
    const { data: rows } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, target_id, status')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', eid)
      .eq('matrix_context', 'genel')
    pairs.push(...(rows || []))
  }

  const toReopen = (pairs || []).filter((p) => p.status === 'completed')
  console.log(`\nGenel OUT toplam atama: ${pairs.length}`)
  console.log(`Yeniden açılacak (tamamlanan): ${toReopen.length}`)

  if (!APPLY) {
    console.log('\nDry-run. Uygulamak için:\n  node scripts/fix-onur-aysegul-genel-out.mjs --apply')
    return
  }

  console.log('\n=== 1) Onur eksik atamalar ===')
  for (const targetId of missingForOnur) {
    const { error } = await sb.from('evaluation_assignments').insert({
      period_id: PERIOD,
      evaluator_id: onurId,
      target_id: targetId,
      matrix_context: 'genel',
      status: 'pending',
    })
    if (error) throw new Error(`Atama eklenemedi ${targetId}: ${error.message}`)
  }
  console.log(`  +${missingForOnur.length} atama eklendi`)

  console.log('\n=== 2) Değerlendirici varsayılan 8 kategori ===')
  for (const name of EVALUATORS) {
    const eid = evBy.get(name)
    await sb
      .from('evaluation_period_evaluator_categories')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', eid)
      .eq('scope_kind', 'period')

    await sb.from('evaluation_period_evaluator_scope').upsert(
      {
        period_id: PERIOD,
        evaluator_id: eid,
        restrict_period: true,
        duty_mode: 'none',
        duty_package_ids: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,evaluator_id' }
    )

    const { error } = await sb.from('evaluation_period_evaluator_categories').insert(
      categoryIds.map((category_id) => ({
        period_id: PERIOD,
        evaluator_id: eid,
        category_id,
        scope_kind: 'period',
        is_active: true,
      }))
    )
    if (error) throw error
    console.log(`  ${name}: varsayılan 8 kategori`)
  }

  console.log('\n=== 3) Hedef başına 8 kategori kapsamı ===')
  const { data: allPairs } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id, target_id')
    .eq('period_id', PERIOD)
    .eq('matrix_context', 'genel')
    .in('evaluator_id', [...evBy.values()])

  let scopeN = 0
  for (const row of allPairs || []) {
    await applyEightCategoryScope(sb, row.evaluator_id, row.target_id, categoryIds)
    scopeN++
    if (scopeN % 20 === 0) process.stdout.write(`  ${scopeN}/${allPairs.length}\r`)
  }
  console.log(`  ${scopeN} çift güncellendi`)

  console.log('\n=== 4) Yanlış tamamlanmış genel OUT formlarını yeniden aç ===')
  const { data: completed } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, status')
    .eq('period_id', PERIOD)
    .eq('matrix_context', 'genel')
    .in('evaluator_id', [...evBy.values()])
    .eq('status', 'completed')

  const reopenIds = (completed || []).map((a) => a.id)
  if (!reopenIds.length) {
    console.log('  Yeniden açılacak atama yok')
  } else {
    const backupDir = resolve(root, 'backups/assignments')
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = resolve(backupDir, `${stamp}_onur-aysegul_genel_out_bulk.json`)

    const backupPayload = {
      backup_kind: 'genel_out_bulk_reopen',
      period_id: PERIOD,
      evaluators: EVALUATORS,
      created_at: new Date().toISOString(),
      assignments: [],
    }

    for (const id of reopenIds) {
      const { data: a } = await sb
        .from('evaluation_assignments')
        .select('id,status,evaluator:evaluator_id(name),target:target_id(name)')
        .eq('id', id)
        .single()
      const { data: responses } = await sb.from('evaluation_responses').select('*').eq('assignment_id', id)
      backupPayload.assignments.push({ assignment: a, responses: responses || [] })
    }
    writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8')
    console.log(`  Yedek: ${backupPath}`)

    await sb.from('evaluation_responses').delete().in('assignment_id', reopenIds)
    try {
      await sb.from('international_standard_scores').delete().in('assignment_id', reopenIds)
    } catch {
      /* optional */
    }
    const { error: uErr2 } = await sb
      .from('evaluation_assignments')
      .update({ status: 'pending', completed_at: null })
      .in('id', reopenIds)
    if (uErr2) throw uErr2
    console.log(`  ${reopenIds.length} atama pending yapıldı`)
  }

  // Verify
  const { count: onurAfter } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', onurId)
    .eq('matrix_context', 'genel')

  const { data: scopeCheck } = await sb
    .from('evaluation_period_evaluator_target_categories')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', aysegulId)
    .eq('matrix_context', 'genel')
    .eq('is_active', true)

  const byTarget = new Map()
  for (const r of scopeCheck || []) {
    const t = String(r.target_id)
    byTarget.set(t, (byTarget.get(t) || 0) + 1)
  }
  const counts = [...new Set([...byTarget.values()])]

  console.log('\n=== Doğrulama ===')
  console.log(`Onur genel hedef: ${onurAfter}`)
  console.log(`Ayşegül hedef başına kategori sayıları: ${counts.join(', ')}`)
  console.log('\n✓ Tamamlandı. Koordinatör 9 soruluk form (yasam_koordinatoru) dokunulmadı.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
