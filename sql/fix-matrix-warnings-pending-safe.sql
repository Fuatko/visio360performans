-- Matrix uyarıları (19 atama) — güvenli düzeltme
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
--
-- YAPILAN:
--   1) Paul LAFORGE → Kulüp Öğretmeni görev profiline ekle (kulüp formları için)
--   2) Pending yanlış atamaları sil (0 yanıt kontrolü ile):
--      - Ebru AKTİMUR hedef zümre (görevi yok)
--      - Şule KOÇAK hedef rehberlik (profilde zümre var, rehber yok)
--      - Gökhan BÜYÜKENGEZ hedef sınıf öğretmeni (sınıf görevi yok)
--
-- DOKUNULMAZ: completed atamalar, evaluation_responses (bu id’lerde zaten 0)
-- Paul GEORGES / Paul LAFORGE karıştırılmaz (sabit id)

begin;

-- Sabitler
-- period_id     = a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- paul_laforge    = d2ce2e2b-ac5c-4f26-95ce-ff7dc3c98c9e
-- paul_georges    = 6350a539-e0aa-49b7-8895-9ee572124bfe  (karışıklık kontrolü)
-- ebru            = 63c3c8cf-df01-40f5-aaa4-1d0768b4d21d
-- sule            = 6b73c2a6-afb2-437d-b9cc-1c789e13344c
-- gokhan_buyuk    = 4a92e11a-809f-45ef-a3dc-71ed77a8624c
-- duty_kulup      = ed8f387d-ee3f-473e-a54f-321c521c4a10  (Kulüp Öğretmeni)

do $$
declare
  v_laforge uuid := 'd2ce2e2b-ac5c-4f26-95ce-ff7dc3c98c9e';
  v_georges uuid := '6350a539-e0aa-49b7-8895-9ee572124bfe';
begin
  if v_laforge = v_georges then
    raise exception 'Güvenlik: Paul LAFORGE = Paul GEORGES id — durduruldu';
  end if;
end $$;

-- 1) Paul LAFORGE kulüp görevi (profil)
insert into evaluation_period_user_duties (period_id, user_id, duty_id, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid,
  'd2ce2e2b-ac5c-4f26-95ce-ff7dc3c98c9e'::uuid,
  'ed8f387d-ee3f-473e-a54f-321c521c4a10'::uuid,
  true
where not exists (
  select 1
  from evaluation_period_user_duties epud
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and epud.user_id = 'd2ce2e2b-ac5c-4f26-95ce-ff7dc3c98c9e'
    and epud.duty_id = 'ed8f387d-ee3f-473e-a54f-321c521c4a10'
);

-- 2) Yanlış pending atamalar — önce yanıt (varsa) sonra atama
delete from evaluation_responses
where assignment_id in (
  select ea.id
  from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.status = 'pending'
    and (
      (ea.target_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d' and ea.matrix_context = 'zumre')
      or (ea.target_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c' and ea.matrix_context = 'rehberlik_ogretmeni')
      or (ea.target_id = '4a92e11a-809f-45ef-a3dc-71ed77a8624c' and ea.matrix_context = 'sinif_ogretmeni')
    )
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and status = 'pending'
  and (
    (target_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d' and matrix_context = 'zumre')
    or (target_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c' and matrix_context = 'rehberlik_ogretmeni')
    or (target_id = '4a92e11a-809f-45ef-a3dc-71ed77a8624c' and matrix_context = 'sinif_ogretmeni')
  );

-- 3) İsteğe bağlı kapsam artığı (hedef+matris; atama gitti)
delete from evaluation_period_evaluator_target_categories tc
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and (
    (tc.target_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d' and tc.matrix_context = 'zumre')
    or (tc.target_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c' and tc.matrix_context = 'rehberlik_ogretmeni')
    or (tc.target_id = '4a92e11a-809f-45ef-a3dc-71ed77a8624c' and tc.matrix_context = 'sinif_ogretmeni')
  )
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = tc.period_id
      and ea.evaluator_id = tc.evaluator_id
      and ea.target_id = tc.target_id
      and ea.matrix_context = tc.matrix_context
  );

delete from evaluation_period_evaluator_target_scope s
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and (
    (s.target_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d' and s.matrix_context = 'zumre')
    or (s.target_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c' and s.matrix_context = 'rehberlik_ogretmeni')
    or (s.target_id = '4a92e11a-809f-45ef-a3dc-71ed77a8624c' and s.matrix_context = 'sinif_ogretmeni')
  )
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = s.period_id
      and ea.evaluator_id = s.evaluator_id
      and ea.target_id = s.target_id
      and ea.matrix_context = s.matrix_context
  );

commit;

-- === Doğrulama ===
select 'Paul LAFORGE gorev' as rapor, d.name
from evaluation_period_user_duties epud
join evaluation_duties d on d.id = epud.duty_id
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and epud.user_id = 'd2ce2e2b-ac5c-4f26-95ce-ff7dc3c98c9e'
  and epud.is_active = true;

select 'Kalan yanlis pending' as rapor, tg.name, ea.matrix_context, count(*)
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.status = 'pending'
  and (
    (tg.name = 'Ebru AKTİMUR' and ea.matrix_context = 'zumre')
    or (tg.name = 'Şule KOÇAK' and ea.matrix_context = 'rehberlik_ogretmeni')
    or (tg.name = 'Gökhan BÜYÜKENGEZ' and ea.matrix_context = 'sinif_ogretmeni')
  )
group by 1, 2, 3;
