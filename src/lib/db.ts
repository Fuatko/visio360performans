// ============================================================================
// Merkezi PostgreSQL bağlantı havuzu — Türkiye self-host DB (göç altyapısı / Faz 0)
// ============================================================================
// ÖNEMLİ: Bu modül MEVCUT supabase-js koduna DOKUNMAZ. Paralel durur.
// Yalnızca PG_DATABASE_URL env değişkeni set edildiğinde bağlanır; aksi halde
// tamamen pasiftir (hiçbir mevcut akışı etkilemez).
//
// Kullanım (ileride, modül modül göçte):
//   import { withActor } from '@/lib/server/secure-query'
//   await withActor(actor, (c) => c.query('select ... from ... where ...'))
// Doğrudan (kapsam gerektirmeyen sistem sorguları için):
//   import { query } from '@/lib/db'
//
// Env (Vercel'e değil, önce .env.local'e paralel eklenir):
//   PG_DATABASE_URL=postgresql://visio360_app:<sifre>@<host>:5432/visio360_prod?sslmode=require
// ============================================================================

import { Pool, type PoolConfig } from 'pg'

const connectionString = process.env.PG_DATABASE_URL?.trim()

// Fluid Compute (Vercel) instance'ları ve dev HMR arasında tek havuzu yeniden kullan.
declare global {
  // eslint-disable-next-line no-var
  var __visio_pg_pool: Pool | undefined
}

function makePool(): Pool {
  if (!connectionString) {
    throw new Error('PG_DATABASE_URL tanımlı değil — pg bağlantı katmanı devre dışı.')
  }
  const config: PoolConfig = {
    connectionString,
    // TLS zorunlu. Şu an sunucuda self-signed (snakeoil) sertifika var → require
    // (şifreli ama CN doğrulamasız). PRODUCTION'a geçmeden önce sunucuya
    // doğrulanabilir sertifika (Let's Encrypt) koyup rejectUnauthorized:true yapılmalı.
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  }
  return new Pool(config)
}

export function getPool(): Pool {
  if (!global.__visio_pg_pool) global.__visio_pg_pool = makePool()
  return global.__visio_pg_pool
}

/** Kapsam gerektirmeyen sistem sorguları için düz sorgu. Org izolasyonu GEREKEN
 *  sorgularda withActor() kullanın — bu fonksiyon RLS bağlamı kurmaz. */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await getPool().query(text, params as never)
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 }
}

/** PG_DATABASE_URL set mi? (kod, pg'nin aktif olup olmadığını buradan anlar.) */
export function isPgEnabled(): boolean {
  return Boolean(connectionString)
}
