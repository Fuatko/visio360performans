-- Veli İletişimi: genel değerlendirme alt kategorisi + soru bağlantısı
-- Hem categories (eski/flat) hem question_categories şemasını destekler.
-- Sonra: Dönemler → Soru Seçimi → İçerik kilitle.

create or replace function pg_temp.col_exists(p_table text, p_col text) returns boolean
language sql stable as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_col
  );
$$;

do $$
declare
  ref_main_id uuid;
  veli_qc_id uuid;
  veli_cat_id uuid;
  ref_from_categories uuid;
  veli_fr constant text := 'Communication avec les parents d''élèves';
  genel_names text[] := array[
    'Mesleki Sorumluluk',
    'Pedagojik Yetkinlik',
    'Ölçme ve Değerlendirme',
    'Öğrenci İlişkileri ve Empati',
    'Veli İletişimi'
  ];
begin
  -- ── Ana başlık (main_categories) ─────────────────────────────────────
  if pg_temp.col_exists('question_categories', 'main_category_id') then
    select c.main_category_id into ref_main_id
    from public.question_categories c
    where c.name = any(genel_names)
    limit 1;
  end if;

  if ref_main_id is null and pg_temp.col_exists('categories', 'main_category_id') then
    execute '
      select c.main_category_id from public.categories c
      where c.name = any($1) and c.main_category_id is not null
      limit 1'
    into ref_main_id using genel_names;
  end if;

  if ref_main_id is null then
    select id into ref_main_id
    from public.main_categories
    where name ilike any (array['%öğretmen%', '%genel%', '%performans%', '%değerlendirme%'])
    order by case when name ilike '%öğretmen%' then 0 when name ilike '%genel%' then 1 else 2 end,
             sort_order nulls last
    limit 1;
  end if;

  if ref_main_id is null and pg_temp.col_exists('question_categories', 'main_category_id') then
    select c.main_category_id into ref_main_id
    from public.question_categories c
    where c.main_category_id is not null
    group by c.main_category_id
    order by count(*) desc
    limit 1;
  end if;

  raise notice 'Ana başlık id: %', coalesce(ref_main_id::text, '(yok — flat categories)');

  -- ── A) categories tablosu (çoğu kurulumda genel alt kategoriler burada) ──
  if to_regclass('public.categories') is not null then
    select id into veli_cat_id from public.categories where name = 'Veli İletişimi' limit 1;

    if veli_cat_id is null then
      veli_cat_id := gen_random_uuid();
      if pg_temp.col_exists('categories', 'main_category_id') and ref_main_id is not null then
        execute '
          insert into public.categories (id, main_category_id, name, name_fr)
          values ($1, $2, $3, $4) returning id'
        into veli_cat_id using veli_cat_id, ref_main_id, 'Veli İletişimi', veli_fr;
      elsif pg_temp.col_exists('categories', 'name_fr') then
        if pg_temp.col_exists('categories', 'sort_order') and pg_temp.col_exists('categories', 'is_active') then
          execute '
            insert into public.categories (id, name, name_fr, sort_order, is_active)
            values ($1, $2, $3,
              coalesce((select max(sort_order) from public.categories), 0) + 1,
              true) returning id'
          into veli_cat_id using veli_cat_id, 'Veli İletişimi', veli_fr;
        else
          execute 'insert into public.categories (id, name, name_fr) values ($1, $2, $3) returning id'
          into veli_cat_id using veli_cat_id, 'Veli İletişimi', veli_fr;
        end if;
      else
        execute 'insert into public.categories (id, name) values ($1, $2) returning id'
        into veli_cat_id using veli_cat_id, 'Veli İletişimi';
      end if;
      raise notice 'Veli İletişimi categories''e eklendi: %', veli_cat_id;
    else
      if pg_temp.col_exists('categories', 'name_fr') then
        update public.categories
        set name_fr = coalesce(nullif(trim(name_fr), ''), veli_fr)
        where id = veli_cat_id;
      end if;
      if pg_temp.col_exists('categories', 'main_category_id') and ref_main_id is not null then
        update public.categories set main_category_id = ref_main_id
        where id = veli_cat_id and main_category_id is distinct from ref_main_id;
      end if;
      raise notice 'Veli İletişimi categories''de güncellendi: %', veli_cat_id;
    end if;

    update public.questions q
    set category_id = veli_cat_id
    where q.text ilike 'Veli ile%'
      and q.category_id::text is distinct from veli_cat_id::text;
  end if;

  -- ── B) question_categories (Admin → Sorular ekranı) ─────────────────
  if to_regclass('public.question_categories') is not null then
    select id into veli_qc_id from public.question_categories where name = 'Veli İletişimi' limit 1;

    if veli_qc_id is null and ref_main_id is not null then
      insert into public.question_categories (main_category_id, name, name_fr, sort_order, is_active)
      select ref_main_id, 'Veli İletişimi', veli_fr,
             coalesce((select max(sort_order) from public.question_categories where main_category_id = ref_main_id), 0) + 1,
             true
      returning id into veli_qc_id;
      raise notice 'Veli İletişimi question_categories''e eklendi: %', veli_qc_id;
    elsif veli_qc_id is not null and ref_main_id is not null then
      update public.question_categories
      set main_category_id = ref_main_id,
          is_active = true,
          name_fr = coalesce(nullif(trim(name_fr), ''), veli_fr)
      where id = veli_qc_id;
      raise notice 'Veli İletişimi question_categories güncellendi: %', veli_qc_id;
    elsif veli_qc_id is null and ref_main_id is null then
      raise notice 'question_categories: ana başlık bulunamadı — yalnızca categories yolu uygulandı';
    end if;

    -- Soruları question_categories''e taşı (Admin UI için; categories id ile çakışmasın diye qc öncelikli)
    if veli_qc_id is not null then
      update public.questions q
      set category_id = veli_qc_id
      where q.text ilike 'Veli ile%'
        and q.category_id::text is distinct from veli_qc_id::text;
    end if;
  end if;

  raise notice 'Bitti. Dönemler → Soru Seçimi''nde Veli İletişimi''ni işaretleyip İçerik kilitleyin.';
end $$;

-- Kontrol
select
  'categories' as tablo,
  c.id,
  c.name,
  (select count(*) from public.questions q where q.category_id::text = c.id::text and q.text ilike 'Veli ile%') as veli_soru
from public.categories c
where c.name = 'Veli İletişimi'

union all

select
  'question_categories' as tablo,
  c.id,
  c.name,
  (select count(*) from public.questions q where q.category_id::text = c.id::text and q.text ilike 'Veli ile%') as veli_soru
from public.question_categories c
where c.name = 'Veli İletişimi';
