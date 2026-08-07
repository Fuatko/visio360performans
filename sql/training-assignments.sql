-- Eğitim Merkezi — yerel atama kaydı (InspiraSuite'e ATANAN eğitimlerin Visio360PDS kopyası)
-- Idempotent, EKLEMELİ migration (DROP/DELETE yok — mevcut veriye dokunmaz).
--
-- Amaç: "Kullanıcılar / Atamalar" listesini InspiraSuite'e kişi-başı çağrı atmadan
-- (N+1'siz) hızlı göstermek. Atama yapılınca hem InspiraSuite'e gider hem buraya yazılır.
-- İlerleme (progress_cache/status_cache) InspiraSuite bulk progress ucundan periyodik senkronlanır.
-- Tamamlanmalar ayrıca training_completions tablosuna webhook ile düşmeye devam eder.

create table if not exists public.training_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                       -- Visio360PDS users.id (varsa)
  user_email text not null,
  user_name text,
  course_id text not null,
  course_title text,
  assigned_by text,                   -- atayan yönetici adı veya "Visio360PDS (Otomatik)"
  reason text,
  gap_competency text,                -- otomatik atamada tetikleyen yetkinlik
  due_date date,
  source text not null default 'manual',        -- 'manual' | 'auto'
  organization_id uuid,
  progress_cache int not null default 0 check (progress_cache between 0 and 100),
  status_cache text not null default 'assigned',-- 'assigned' | 'in_progress' | 'completed'
  synced_at timestamptz,              -- progress_cache en son ne zaman güncellendi
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_email, course_id)
);

create index if not exists training_assignments_org_idx on public.training_assignments(organization_id);
create index if not exists training_assignments_email_idx on public.training_assignments(user_email);
create index if not exists training_assignments_status_idx on public.training_assignments(status_cache);
create index if not exists training_assignments_user_idx on public.training_assignments(user_id);

-- Erişim yalnızca sunucudaki service-role route'ları üzerinden (super_admin/org_admin doğrulaması ile).
-- RLS açık, public policy yok — diğer entegrasyon tablolarıyla aynı desen.
alter table if exists public.training_assignments enable row level security;
