#!/usr/bin/env node
/**
 * sql/survey-channels.sql dosyasını production veritabanına TEK İŞLEM olarak
 * uygular ve sonucu doğrular. Hata olursa tamamı geri alınır.
 * Yalnızca bu migration'ı çalıştırır; başka hiçbir şeye dokunmaz.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// .env.local'den PG_DATABASE_URL oku (zaten ortamda varsa ona dokunulmaz).
function loadEnvLocal() {
  if (process.env.PG_DATABASE_URL) return
  const p = resolve(root, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*PG_DATABASE_URL\s*=\s*(.*)\s*$/)
    if (!m) continue
    process.env.PG_DATABASE_URL = m[1].replace(/^["']|["']$/g, '').trim()
    break
  }
}

loadEnvLocal()
const connectionString = process.env.PG_DATABASE_URL
if (!connectionString) {
  console.error('PG_DATABASE_URL bulunamadı (.env.local içinde de yok). Uygulama yapılmadı.')
  process.exit(1)
}

const sqlPath = resolve(root, 'sql/survey-channels.sql')
const sql = readFileSync(sqlPath, 'utf8')

const client = new pg.Client({
  connectionString,
  ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
})

const DOGRULAMA = `
select
  (select count(*)::int from information_schema.tables
     where table_schema = 'public' and table_name = 'survey_channels')            as tablo,
  (select count(*)::int from information_schema.columns
     where table_schema = 'public' and table_name = 'survey_responses'
       and column_name = 'channel_id')                                            as kolon,
  (select count(*)::int from pg_policies
     where schemaname = 'public' and tablename = 'survey_channels'
       and policyname = 'org_isolation')                                          as politika,
  (select count(*)::int from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'survey_channels'
       and grantee = 'visio360_app')                                              as yetki,
  (select count(*)::int from public.survey_responses)                             as mevcut_cevap,
  (select count(*)::int from public.survey_responses where channel_id is not null) as kanalli_cevap
`

async function main() {
  await client.connect()
  // Uygulama ÖNCESİ cevap sayısı — sonrasıyla aynı olmalı.
  const before = await client.query('select count(*)::int as n from public.survey_responses')
  console.log('Uygulama öncesi cevap sayısı:', before.rows[0].n)

  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('commit')
    console.log('Migration uygulandı (tek işlem, commit edildi).')
  } catch (e) {
    await client.query('rollback').catch(() => {})
    console.error('HATA — tamamı geri alındı, veritabanında hiçbir değişiklik yok:')
    console.error(e.message)
    await client.end()
    process.exit(1)
  }

  const r = await client.query(DOGRULAMA)
  console.log('Doğrulama:', r.rows[0])
  await client.end()
}

main().catch(async (e) => {
  console.error(e)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
