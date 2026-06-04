#!/usr/bin/env node
/**
 * Canlı DB'den matris isim listeleri ek dosyasını üretir.
 *
 *   SUPABASE_DB_URL="postgresql://..." node scripts/export-degerlendirme-matris-docs.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const PERIOD_ID = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnv(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
}

const dbUrl =
  process.env.SUPABASE_DB_URL ||
  loadEnv(join(ROOT, '.env.runtime')).SUPABASE_DB_URL ||
  ''

if (!dbUrl) {
  console.error('SUPABASE_DB_URL gerekli')
  process.exit(1)
}

const sql = `
SELECT ev.name, coalesce(ea.matrix_context, 'genel'), tg.name
FROM evaluation_assignments ea
JOIN users ev ON ev.id = ea.evaluator_id
JOIN users tg ON tg.id = ea.target_id
WHERE ea.period_id = '${PERIOD_ID}'
ORDER BY ev.name, 2, tg.name;
`

const res = spawnSync('psql', [dbUrl, '-t', '-A', '-F', '\t', '-c', sql], { encoding: 'utf8' })
if (res.status !== 0) {
  console.error(res.stderr || res.stdout)
  process.exit(1)
}

const MAT_LABEL = {
  genel: 'Genel değerlendirme',
  okul_yasam: 'Okul yaşam (seçili kategoriler)',
  zumre: 'Zümre başkanı görevi',
  sinif_ogretmeni: 'Sınıf öğretmeni görevi',
  rehberlik_ogretmeni: 'Rehber öğretmeni görevi',
  nobetci_ogretmeni: 'Nöbetçi öğretmen görevi',
  kulup_ogretmeni: 'Kulüp öğretmeni görevi',
  formator: 'Formatör görevi',
  yasam_koordinatoru: 'Yaşam koordinatörü görevi',
  bilimsel_etkinlik_koordinatoru: 'Bilimsel etkinlik koordinatörü görevi',
}

const lines = res.stdout.trim().split('\n').filter(Boolean)
const byEv = new Map()
for (const line of lines) {
  const [ev, mat, tg] = line.split('\t')
  if (!byEv.has(ev)) byEv.set(ev, new Map())
  const m = byEv.get(ev)
  if (!m.has(mat)) m.set(mat, [])
  m.get(mat).push(tg)
}
for (const m of byEv.values()) {
  for (const arr of m.values()) arr.sort((a, b) => a.localeCompare(b, 'tr'))
}

const summaryRows = []
for (const [ev, mats] of byEv) {
  const row = { ev, toplam: 0 }
  for (const mat of Object.keys(MAT_LABEL)) {
    row[mat] = mats.get(mat)?.length ?? 0
    row.toplam += row[mat]
  }
  summaryRows.push(row)
}
summaryRows.sort((a, b) => b.toplam - a.toplam)

const matOrder = Object.keys(MAT_LABEL)
let appendix = '# Ek: Değerlendiren × Matris — Tam isim listeleri\n\n'
appendix += `**Dönem:** 2026 EĞİTMEN (\`${PERIOD_ID}\`)  \n`
appendix += `**Üretim:** ${new Date().toISOString().slice(0, 10)} (canlı DB)  \n`
appendix += `**Satır sayısı:** ${lines.length} atama\n\n---\n\n`

for (const { ev, toplam } of summaryRows) {
  const mats = byEv.get(ev)
  appendix += `## ${ev}\n\n**Toplam atama:** ${toplam}\n\n`
  for (const mat of matOrder) {
    const list = mats.get(mat)
    if (!list?.length) continue
    appendix += `### ${MAT_LABEL[mat]} (${list.length})\n\n`
    list.forEach((name, i) => {
      appendix += `${i + 1}. ${name}\n`
    })
    appendix += '\n'
  }
  appendix += '---\n\n'
}

const outPath = join(ROOT, 'docs/ekler/degerlendirme-matris-isim-listeleri-2026.md')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, appendix)
console.log('Yazıldı:', outPath, `(${lines.length} atama)`)
