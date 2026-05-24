-- Veli İletişimi: Türkçe kayıtlara Fransızca çeviri (name_fr / text_fr)
-- Supabase SQL Editor'da bir kez çalıştırın (tüm dosyayı).
-- Sonra: Dönemler → İçerik kilitle (snapshot) yenileyin.

create or replace function pg_temp.norm_tr(text) returns text
language sql immutable as $$
  select trim(trailing '.' from trim(trailing '?' from trim($1)));
$$;

create temp table if not exists _veli_iletisimi_fr (
  cat_tr text not null,
  cat_fr text not null,
  q_tr text not null,
  q_fr text not null,
  a_tr text not null,
  a_fr text not null
);

truncate _veli_iletisimi_fr;

insert into _veli_iletisimi_fr (cat_tr, cat_fr, q_tr, q_fr, a_tr, a_fr) values
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yüz yüze iletişimde (toplantı, görüşme, problem çözme) nasıl bir tutum sergiler?',
  'Comment évaluez-vous l''attitude de la personne du point de vue des rencontres « en chair et en os » avec les parents (réunions, rencontres, résolutions de problèmes) ?',
  'Profesyonel, yapıcı ve çözüm odaklı bir tutumla yürütür; problem durumlarında veliyle işbirliği yapar',
  'Mène les rencontres et communications en faisant preuve d''une attitude professionnelle, constructive et tournée vers la résolution des problèmes ; coopère avec les parents dans les situations problématiques.'
),
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yüz yüze iletişimde (toplantı, görüşme, problem çözme) nasıl bir tutum sergiler?',
  'Comment évaluez-vous l''attitude de la personne du point de vue des rencontres « en chair et en os » avec les parents (réunions, rencontres, résolutions de problèmes) ?',
  'Genelde profesyoneldir ancak zorlu durumlarda gerilim yaşanabilir',
  'Fait généralement preuve de professionnalisme mais des tensions peuvent se faire jour dans les situations difficiles.'
),
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yüz yüze iletişimde (toplantı, görüşme, problem çözme) nasıl bir tutum sergiler?',
  'Comment évaluez-vous l''attitude de la personne du point de vue des rencontres « en chair et en os » avec les parents (réunions, rencontres, résolutions de problèmes) ?',
  'Veli iletişiminde yetersizdir',
  'Communication insuffisante avec les parents.'
),
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yüz yüze iletişimde (toplantı, görüşme, problem çözme) nasıl bir tutum sergiler?',
  'Comment évaluez-vous l''attitude de la personne du point de vue des rencontres « en chair et en os » avec les parents (réunions, rencontres, résolutions de problèmes) ?',
  'Fikrim yok',
  'Aucune idée'
),
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yazılı iletişim ve bilgilendirme konusunda tutumu nasıldır?',
  'Comment évaluez-vous l''attitude de la personne du point de vue de la communication et de la transmission d''information par écrit avec les parents ?',
  'Veliyle yazılı iletişimi kurumsal ve anlaşılırdır',
  'La communication avec les parents est institutionnelle et intelligible.'
),
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yazılı iletişim ve bilgilendirme konusunda tutumu nasıldır?',
  'Comment évaluez-vous l''attitude de la personne du point de vue de la communication et de la transmission d''information par écrit avec les parents ?',
  'Yazışmalarda profesyonellik eksik kalabilir',
  'Des manquements au professionnalisme peuvent parfois se faire jour dans les échanges écrits.'
),
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yazılı iletişim ve bilgilendirme konusunda tutumu nasıldır?',
  'Comment évaluez-vous l''attitude de la personne du point de vue de la communication et de la transmission d''information par écrit avec les parents ?',
  'Yazışmaları sorunludur',
  'Les communications écrites sont problématiques.'
),
(
  'Veli İletişimi',
  'Communication avec les parents d''élèves',
  'Veli ile yazılı iletişim ve bilgilendirme konusunda tutumu nasıldır?',
  'Comment évaluez-vous l''attitude de la personne du point de vue de la communication et de la transmission d''information par écrit avec les parents ?',
  'Fikrim yok',
  'Aucune idée'
);

-- Alt kategori tablosu: question_categories veya categories (ikisi de varsa ikisi de güncellenir)
do $$
begin
  if to_regclass('public.question_categories') is not null then
    update public.question_categories c
    set name_fr = x.cat_fr
    from (select distinct cat_tr, cat_fr from _veli_iletisimi_fr) x
    where c.name = x.cat_tr;
  end if;

  if to_regclass('public.categories') is not null then
    update public.categories c
    set name_fr = x.cat_fr
    from (select distinct cat_tr, cat_fr from _veli_iletisimi_fr) x
    where c.name = x.cat_tr;
  end if;
end $$;

-- Sorular (text_fr) — category_id uuid/varchar uyumu için ::text
do $$
begin
  if to_regclass('public.questions') is null then
    return;
  end if;

  if to_regclass('public.question_categories') is not null then
    update public.questions q
    set text_fr = x.q_fr
    from (
      select c.id::text as category_id, i.q_tr, max(i.q_fr) as q_fr
      from _veli_iletisimi_fr i
      join public.question_categories c on c.name = i.cat_tr
      group by c.id::text, i.q_tr
    ) x
    where q.category_id::text = x.category_id
      and pg_temp.norm_tr(q.text) = pg_temp.norm_tr(x.q_tr);
  end if;

  if to_regclass('public.categories') is not null then
    update public.questions q
    set text_fr = x.q_fr
    from (
      select c.id::text as category_id, i.q_tr, max(i.q_fr) as q_fr
      from _veli_iletisimi_fr i
      join public.categories c on c.name = i.cat_tr
      group by c.id::text, i.q_tr
    ) x
    where q.category_id::text = x.category_id
      and pg_temp.norm_tr(q.text) = pg_temp.norm_tr(x.q_tr);
  end if;
end $$;

-- Cevaplar (text_fr)
do $$
begin
  if to_regclass('public.questions') is null then
    return;
  end if;

  if to_regclass('public.question_answers') is not null then
    if to_regclass('public.question_categories') is not null then
      update public.question_answers a
      set text_fr = x.a_fr
      from (
        select q.id::text as question_id, i.a_tr, max(i.a_fr) as a_fr
        from _veli_iletisimi_fr i
        join public.question_categories c on c.name = i.cat_tr
        join public.questions q on q.category_id::text = c.id::text
          and pg_temp.norm_tr(q.text) = pg_temp.norm_tr(i.q_tr)
        group by q.id::text, i.a_tr
      ) x
      where a.question_id::text = x.question_id
        and pg_temp.norm_tr(a.text) = pg_temp.norm_tr(x.a_tr);
    end if;

    if to_regclass('public.categories') is not null then
      update public.question_answers a
      set text_fr = x.a_fr
      from (
        select q.id::text as question_id, i.a_tr, max(i.a_fr) as a_fr
        from _veli_iletisimi_fr i
        join public.categories c on c.name = i.cat_tr
        join public.questions q on q.category_id::text = c.id::text
          and pg_temp.norm_tr(q.text) = pg_temp.norm_tr(i.q_tr)
        group by q.id::text, i.a_tr
      ) x
      where a.question_id::text = x.question_id
        and pg_temp.norm_tr(a.text) = pg_temp.norm_tr(x.a_tr);
    end if;
  end if;

  if to_regclass('public.answers') is not null then
    if to_regclass('public.categories') is not null then
      update public.answers a
      set text_fr = x.a_fr
      from (
        select q.id::text as question_id, i.a_tr, max(i.a_fr) as a_fr
        from _veli_iletisimi_fr i
        join public.categories c on c.name = i.cat_tr
        join public.questions q on q.category_id::text = c.id::text
          and pg_temp.norm_tr(q.text) = pg_temp.norm_tr(i.q_tr)
        group by q.id::text, i.a_tr
      ) x
      where a.question_id::text = x.question_id
        and pg_temp.norm_tr(a.text) = pg_temp.norm_tr(x.a_tr);
    end if;

    if to_regclass('public.question_categories') is not null then
      update public.answers a
      set text_fr = x.a_fr
      from (
        select q.id::text as question_id, i.a_tr, max(i.a_fr) as a_fr
        from _veli_iletisimi_fr i
        join public.question_categories c on c.name = i.cat_tr
        join public.questions q on q.category_id::text = c.id::text
          and pg_temp.norm_tr(q.text) = pg_temp.norm_tr(i.q_tr)
        group by q.id::text, i.a_tr
      ) x
      where a.question_id::text = x.question_id
        and pg_temp.norm_tr(a.text) = pg_temp.norm_tr(x.a_tr);
    end if;
  end if;
end $$;

-- Yedek: 1. soru (yüz yüze) — soru işareti / kategori join kaçtıysa doğrudan güncelle
do $$
declare
  q1_fr constant text := 'Comment évaluez-vous l''attitude de la personne du point de vue des rencontres « en chair et en os » avec les parents (réunions, rencontres, résolutions de problèmes) ?';
begin
  if to_regclass('public.questions') is null then
    return;
  end if;

  update public.questions q
  set text_fr = q1_fr
  where q.text ilike 'Veli ile yüz yüze iletişimde%'
    and coalesce(trim(q.text_fr), '') = '';

  if to_regclass('public.question_answers') is not null then
    update public.question_answers a
    set text_fr = v.a_fr
    from public.questions q,
    (values
      ('Profesyonel, yapıcı ve çözüm odaklı bir tutumla yürütür; problem durumlarında veliyle işbirliği yapar', 'Mène les rencontres et communications en faisant preuve d''une attitude professionnelle, constructive et tournée vers la résolution des problèmes ; coopère avec les parents dans les situations problématiques.'),
      ('Genelde profesyoneldir ancak zorlu durumlarda gerilim yaşanabilir', 'Fait généralement preuve de professionnalisme mais des tensions peuvent se faire jour dans les situations difficiles.'),
      ('Veli iletişiminde yetersizdir', 'Communication insuffisante avec les parents.'),
      ('Fikrim yok', 'Aucune idée')
    ) as v(a_tr, a_fr)
    where a.question_id::text = q.id::text
      and q.text ilike 'Veli ile yüz yüze iletişimde%'
      and pg_temp.norm_tr(a.text) = pg_temp.norm_tr(v.a_tr);
  end if;

  if to_regclass('public.answers') is not null then
    update public.answers a
    set text_fr = v.a_fr
    from public.questions q,
    (values
      ('Profesyonel, yapıcı ve çözüm odaklı bir tutumla yürütür; problem durumlarında veliyle işbirliği yapar', 'Mène les rencontres et communications en faisant preuve d''une attitude professionnelle, constructive et tournée vers la résolution des problèmes ; coopère avec les parents dans les situations problématiques.'),
      ('Genelde profesyoneldir ancak zorlu durumlarda gerilim yaşanabilir', 'Fait généralement preuve de professionnalisme mais des tensions peuvent se faire jour dans les situations difficiles.'),
      ('Veli iletişiminde yetersizdir', 'Communication insuffisante avec les parents.'),
      ('Fikrim yok', 'Aucune idée')
    ) as v(a_tr, a_fr)
    where a.question_id::text = q.id::text
      and q.text ilike 'Veli ile yüz yüze iletişimde%'
      and pg_temp.norm_tr(a.text) = pg_temp.norm_tr(v.a_tr);
  end if;
end $$;

drop table if exists _veli_iletisimi_fr;
