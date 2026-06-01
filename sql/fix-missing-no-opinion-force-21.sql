-- Eksik 5. şık: aktif 4 şıkkı olan tüm dönem sorularına «Bilgim yok» ekler
-- Pasif/inaktif «bilgim yok» satırı varsa önce onu aktifleştirir (yeni satır açmaz)
-- Supabase SQL Editor → postgres → ardından ana dosyadan §3 snapshot

-- 1) Pasif no-info satırı var mı? (INSERT’i yanlışlıkla engelleyen durum)
select
  qa.question_id,
  count(*) filter (where coalesce(qa.is_active, true)) as active_n,
  count(*) filter (where not coalesce(qa.is_active, true)) as inactive_n,
  count(*) filter (
    where not coalesce(qa.is_active, true)
      and (
        trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
        or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais'
        or lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      )
  ) as inactive_no_info_rows
from question_answers qa
where qa.question_id in (
  select distinct epq.question_id
  from evaluation_period_questions epq
  join evaluation_periods p on p.id = epq.period_id and p.status = 'active'
  where epq.is_active = true
)
group by qa.question_id
having count(*) filter (where coalesce(qa.is_active, true)) < 5
order by inactive_no_info_rows desc, active_n
limit 50;

-- 2) Pasif no-info → aktifleştir
update question_answers qa
set is_active = true
where coalesce(qa.is_active, true) = false
  and (
    trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
    or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis'
    or lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
  )
  and qa.question_id in (
    select distinct epq.question_id
    from evaluation_period_questions epq
    join evaluation_periods p on p.id = epq.period_id and p.status = 'active'
    where epq.is_active = true
  )
  and (
    select count(*) from question_answers x
    where x.question_id = qa.question_id and coalesce(x.is_active, true)
  ) < 5;

-- 3) Hâlâ aktif 4 olanlara yeni 5. şık ekle
do $$
declare
  tgt text;
  ord_col text;
  n int;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'question_answers' and c.relkind in ('r', 'p')
  ) then
    tgt := 'question_answers';
  else
    tgt := 'answers';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = tgt and column_name = 'sort_order'
  ) then
    ord_col := 'sort_order';
  else
    ord_col := 'order_num';
  end if;

  execute format($f$
    with period_q as (
      select distinct epq.question_id
      from evaluation_period_questions epq
      join evaluation_periods p on p.id = epq.period_id and p.status = 'active'
      where epq.is_active = true
    )
    insert into %I (id, question_id, text, text_fr, level, std_score, reel_score, %I, is_active)
    select
      gen_random_uuid(),
      pq.question_id,
      'Bilgim yok.',
      'Je ne sais pas.',
      'no_opinion',
      0,
      0,
      coalesce((
        select max(a.%I) from %I a
        where a.question_id = pq.question_id and coalesce(a.is_active, true)
      ), 4) + 1,
      true
    from period_q pq
    where (
      select count(*) from %I qa
      where qa.question_id = pq.question_id and coalesce(qa.is_active, true)
    ) = 4
    and not exists (
      select 1 from %I qa
      where qa.question_id = pq.question_id
        and coalesce(qa.is_active, true)
        and (
          trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
          or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis'
          or lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
        )
    )
  $f$, tgt, ord_col, ord_col, tgt, tgt, tgt);

  get diagnostics n = row_count;
  raise notice 'FORCE insert: tablo=% satir_eklendi=%', tgt, n;
end $$;

-- 4) Doğrulama
with period_q as (
  select distinct epq.question_id
  from evaluation_period_questions epq
  join evaluation_periods p on p.id = epq.period_id and p.status = 'active'
  where epq.is_active = true
)
select pq.question_id, count(*) filter (where coalesce(qa.is_active, true)) as active_answers
from period_q pq
left join question_answers qa on qa.question_id = pq.question_id
group by pq.question_id
having count(*) filter (where coalesce(qa.is_active, true)) < 5
order by active_answers, pq.question_id
limit 50;
