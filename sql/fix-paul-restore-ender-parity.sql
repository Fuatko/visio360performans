-- Paul GEORGES ↔ Ender ÜSTÜNGEL: aynı değerlendirme seti + kurum admin + Fransızca
--
-- ÖNEMLİ — İKİ FARKLI KİŞİ:
--   • Paul GEORGES  = değerlendiren / kurum admin (bu script SADECE onu düzeltir)
--   • Paul LAFORGE  = ayrı kişi (hedef veya başka roller); BU SCRIPT ONa DOKUNMAZ
-- Soru bankası / Paul LAFORGE görev dizilimi için fix-fr-* veya reset script çalıştırmayın.
--
-- Neden: fix-paul-reset-pending-preserve-completed.sql yalnızca
-- evaluation_period_evaluator_target_scope içindeki az sayıda satırdan pending üretti;
-- Paul'un çoğu ataması silindi (sadece 2 genel pending kaldı).
--
-- Bu script:
--   1) Paul rolünü org_admin, dilini fr yapar (oturum: /admin)
--   2) Ender'deki TÜM atamaları Paul'da eksik olanları pending olarak ekler (completed dokunulmaz)
--   3) Ender scope + kategori satırlarını Paul'a kopyalar
--
-- Dönem: 2026 EĞİTMEN
-- Paul:  6350a539-e0aa-49b7-8895-9ee572124bfe
-- Ender: 5ec438f5-1eb2-41a0-ab19-4b2a549991cd
--
-- Supabase: DOSYANIN TAMAMINI tek seferde çalıştırın.

-- 0) Teşhis (commit yok)
select
  u.id,
  u.name,
  u.role,
  u.preferred_language,
  u.email
from public.users u
where u.name in ('Paul GEORGES', 'Paul LAFORGE', 'Ender ÜSTÜNGEL')
order by u.name;

select
  'assignments' as kaynak,
  u.name as evaluator,
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) as total_n,
  count(*) filter (where ea.status = 'completed') as completed_n,
  count(*) filter (where ea.status <> 'completed') as pending_n
from public.evaluation_assignments ea
join public.users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and u.name in ('Paul GEORGES', 'Ender ÜSTÜNGEL')
group by u.name, coalesce(ea.matrix_context, 'genel')
order by evaluator, matrix_context;

begin;

create temp table _pair on commit drop as
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
  '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid as paul_georges_id,
  '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'::uuid as ender_id;

do $$
declare
  v_name text;
begin
  select name into v_name from public.users where id = '6350a539-e0aa-49b7-8895-9ee572124bfe';
  if v_name is distinct from 'Paul GEORGES' then
    raise exception 'Güvenlik: 6350a539… kullanıcısı Paul GEORGES değil (%) — script durduruldu.', v_name;
  end if;
  if exists (
    select 1 from public.users
    where name = 'Paul LAFORGE'
      and id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  ) then
    raise exception 'Güvenlik: Paul LAFORGE ile Paul GEORGES ID çakışıyor — script durduruldu.';
  end if;
end $$;

-- 1) Paul GEORGES hesabı: kurum admin + Fransızca form (Paul LAFORGE değişmez)
update public.users u
set
  role = 'org_admin',
  preferred_language = 'fr'
from _pair p
where u.id = p.paul_georges_id;

-- 2) Scope: Ender'de olup Paul'da hedef bazında yoksa kopyala
insert into public.evaluation_period_evaluator_target_scope (
  period_id,
  evaluator_id,
  target_id,
  restrict_period,
  duty_mode,
  duty_package_ids,
  updated_at
)
select
  s.period_id,
  p.paul_georges_id,
  s.target_id,
  s.restrict_period,
  s.duty_mode,
  s.duty_package_ids,
  now()
from public.evaluation_period_evaluator_target_scope s
cross join _pair p
where s.period_id = p.period_id
  and s.evaluator_id = p.ender_id
  and not exists (
    select 1
    from public.evaluation_period_evaluator_target_scope ps
    where ps.period_id = s.period_id
      and ps.evaluator_id = p.paul_georges_id
      and ps.target_id = s.target_id
  );

-- matrix_context kolonu varsa hizala
do $mc$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'evaluation_period_evaluator_target_scope'
      and column_name = 'matrix_context'
  ) then
    update public.evaluation_period_evaluator_target_scope ps
    set matrix_context = s.matrix_context
    from public.evaluation_period_evaluator_target_scope s
    cross join _pair p
    where ps.period_id = p.period_id
      and ps.evaluator_id = p.paul_georges_id
      and s.period_id = p.period_id
      and s.evaluator_id = p.ender_id
      and ps.target_id = s.target_id
      and s.matrix_context is not null
      and coalesce(ps.matrix_context, 'genel') = 'genel'
      and s.matrix_context <> 'genel';
  end if;
end $mc$;

-- 3) Kategori kapsamı: eksik satırları kopyala
insert into public.evaluation_period_evaluator_target_categories (
  period_id,
  evaluator_id,
  target_id,
  category_id,
  scope_kind,
  is_active,
  created_at
)
select
  c.period_id,
  p.paul_georges_id,
  c.target_id,
  c.category_id,
  c.scope_kind,
  c.is_active,
  coalesce(c.created_at, now())
from public.evaluation_period_evaluator_target_categories c
cross join _pair p
where c.period_id = p.period_id
  and c.evaluator_id = p.ender_id
  and c.is_active = true
  and not exists (
    select 1
    from public.evaluation_period_evaluator_target_categories pc
    where pc.period_id = c.period_id
      and pc.evaluator_id = p.paul_georges_id
      and pc.target_id = c.target_id
      and pc.category_id = c.category_id
      and pc.scope_kind = c.scope_kind
  );

do $mcc$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'evaluation_period_evaluator_target_categories'
      and column_name = 'matrix_context'
  ) then
    update public.evaluation_period_evaluator_target_categories pc
    set matrix_context = c.matrix_context
    from public.evaluation_period_evaluator_target_categories c
    cross join _pair p
    where pc.period_id = p.period_id
      and pc.evaluator_id = p.paul_georges_id
      and c.period_id = p.period_id
      and c.evaluator_id = p.ender_id
      and pc.target_id = c.target_id
      and pc.category_id = c.category_id
      and pc.scope_kind = c.scope_kind
      and c.matrix_context is not null
      and coalesce(pc.matrix_context, 'genel') = 'genel'
      and c.matrix_context <> 'genel';
  end if;
end $mcc$;

-- 4) Atamalar: Ender ile aynı (target + matrix_context); mevcut satırlara dokunma
insert into public.evaluation_assignments (
  period_id,
  evaluator_id,
  target_id,
  matrix_context,
  status
)
select
  ea.period_id,
  p.paul_georges_id,
  ea.target_id,
  coalesce(ea.matrix_context, 'genel'),
  'pending'
from public.evaluation_assignments ea
cross join _pair p
where ea.period_id = p.period_id
  and ea.evaluator_id = p.ender_id
  and not exists (
    select 1
    from public.evaluation_assignments pa
    where pa.period_id = ea.period_id
      and pa.evaluator_id = p.paul_georges_id
      and pa.target_id = ea.target_id
      and coalesce(pa.matrix_context, 'genel') = coalesce(ea.matrix_context, 'genel')
  );

-- 5) Özet (commit öncesi)
select
  u.name as evaluator,
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) as total_n,
  count(*) filter (where ea.status = 'completed') as completed_n,
  count(*) filter (where ea.status <> 'completed') as pending_n
from public.evaluation_assignments ea
join public.users u on u.id = ea.evaluator_id
cross join _pair p
where ea.period_id = p.period_id
  and ea.evaluator_id in (p.paul_georges_id, p.ender_id)
group by u.name, coalesce(ea.matrix_context, 'genel')
order by u.name, matrix_context;

select
  u.name as evaluator,
  count(distinct ea.target_id) filter (where coalesce(ea.matrix_context, 'genel') = 'genel') as genel_hedef_sayisi
from public.evaluation_assignments ea
join public.users u on u.id = ea.evaluator_id
cross join _pair p
where ea.period_id = p.period_id
  and ea.evaluator_id in (p.paul_georges_id, p.ender_id)
group by u.name
order by u.name;

commit;

-- Paul çıkış + tekrar giriş (org_admin + fr oturum çerezi için)
