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
    // TLS = verify-full. Sunucuda doğrulanabilir Let's Encrypt sertifikası var
    // (db.visio360performance.com). rejectUnauthorized:true → sunucu sertifikası hem
    // Node'un kök deposuna (ISRG/Let's Encrypt) HEM hostname'e doğrulanır → MITM'e kapalı.
    // ÖNKOŞUL: PG_DATABASE_URL host'u DOMAIN olmalı (ham IP değil), yoksa hostname
    // doğrulaması başarısız olur:
    //   postgresql://visio360_app:<pw>@db.visio360performance.com:35432/visio360_prod?sslmode=verify-full
    ssl: { rejectUnauthorized: true },
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
