#!/usr/bin/env node
/** platform_settings tablosunu oluşturur (rapor bakım modu) */
import { getSupabaseClient } from './_load-env.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '../sql/platform-settings-admin-reports-maintenance.sql')

async function main() {
  const sql = readFileSync(sqlPath, 'utf8')
  const sb = await getSupabaseClient()
  const { error } = await sb.rpc('exec_sql', { query: sql }).maybeSingle?.() ?? { error: null }
  if (error) {
    console.log('rpc exec_sql yok — SQL dosyasını Supabase SQL Editor’de çalıştırın:')
    console.log(sqlPath)
    console.log('\nAlternatif: postgres bağlantınız varsa psql ile uygulayın.')
    process.exit(1)
  }
  console.log('platform_settings hazır.')
}

main().catch((e) => {
  console.error(e)
  console.log('\nManuel: sql/platform-settings-admin-reports-maintenance.sql dosyasını Supabase SQL Editor’de çalıştırın.')
  process.exit(1)
})
