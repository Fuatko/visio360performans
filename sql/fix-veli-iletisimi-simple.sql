-- ═══════════════════════════════════════════════════════════
-- VELI FIX v8 — categories.id = 4 harf kod (MSUY gibi)
-- questions.category_id = UUID → question_categories tablosu
-- Supabase: TÜM dosyayı yapıştırın.
-- ═══════════════════════════════════════════════════════════

-- A) categories (katalog — MSUY formatı, sorular BURAYA bağlanmaz)
insert into public.categories (id, name, sort_order, is_active)
select
  'VELI',
  'Veli İletişimi',
  coalesce((select max(sort_order) from public.categories), 0) + 1,
  true
where not exists (
  select 1 from public.categories where name = 'Veli İletişimi'
)
and not exists (
  select 1 from public.categories where id = 'VELI'
);

update public.categories set is_active = true where name = 'Veli İletişimi';

-- B) question_categories + questions (UUID — asıl bağlantı)
do $$
declare
  veli_id uuid;
  ref_main_id uuid;
begin
  if to_regclass('public.question_categories') is null then
    raise notice 'question_categories yok — yalnızca categories (VELI) eklendi';
    return;
  end if;

  select qc.main_category_id into ref_main_id
  from public.question_categories qc
  where qc.name in (
    'Mesleki Sorumluluk',
    'Pedagojik Yetkinlik',
    'Ölçme ve Değerlendirme',
    'Öğrenci İlişkileri ve Empati',
    'Mesleki Standartlar ve Uygulamalar'
  )
  and qc.main_category_id is not null
  limit 1;

  if ref_main_id is null then
    select qc.main_category_id into ref_main_id
    from public.questions q
    join public.question_categories qc on qc.id = q.category_id
    where qc.main_category_id is not null
    limit 1;
  end if;

  if ref_main_id is null then
    select id into ref_main_id
    from public.main_categories
    where name ilike any (array['%öğretmen%', '%genel%', '%performans%', '%değerlendirme%'])
    limit 1;
  end if;

  select id into veli_id
  from public.question_categories
  where name = 'Veli İletişimi'
  limit 1;

  if veli_id is null then
    insert into public.question_categories (main_category_id, name, sort_order, is_active)
    values (
      ref_main_id,
      'Veli İletişimi',
      coalesce((select max(sort_order) from public.question_categories), 0) + 1,
      true
    )
    returning id into veli_id;
  else
    update public.question_categories
    set main_category_id = coalesce(ref_main_id, main_category_id),
        is_active = true
    where id = veli_id;
  end if;

  update public.questions q
  set category_id = veli_id
  where q.text ilike 'Veli ile%'
    and q.category_id is distinct from veli_id;

  raise notice 'question_categories Veli uuid: %', veli_id;
end $$;

-- Kontrol
select 'categories' as tablo, c.id, c.name, null::uuid as qc_uuid, null::bigint as veli_soru
from public.categories c where c.name = 'Veli İletişimi'

union all

select
  'question_categories' as tablo,
  null::varchar as id,
  qc.name,
  qc.id as qc_uuid,
  count(q.id) as veli_soru
from public.question_categories qc
left join public.questions q on q.category_id = qc.id and q.text ilike 'Veli ile%'
where qc.name = 'Veli İletişimi'
group by qc.id, qc.name;
