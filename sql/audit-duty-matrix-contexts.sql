-- Dönemdeki tüm matrix_context değerleri (yan görev + genel + okul yaşam)
-- Supabase SQL Editor: TÜM dosyayı Run
-- Dönem ID: 2026 EĞİTMEN — gerekirse değiştirin

-- 1) Özet: bağlam başına atama sayısı
select
  coalesce(nullif(trim(matrix_context), ''), 'genel') as matrix_context,
  count(*) as atama,
  count(*) filter (where status = 'completed') as tamamlanan,
  count(*) filter (where status = 'pending') as bekleyen,
  case
    when coalesce(nullif(trim(matrix_context), ''), 'genel') = 'genel' then 'GENEL'
    when coalesce(nullif(trim(matrix_context), ''), 'genel') = 'okul_yasam' then 'OKUL_YASAM'
    when coalesce(nullif(trim(matrix_context), ''), 'genel') in (
      'zumre', 'sinif_ogretmeni', 'rehberlik_ogretmeni', 'nobetci_ogretmeni',
      'kulup_ogretmeni', 'formator', 'yasam_koordinatoru', 'bilimsel_etkinlik_koordinatoru'
    ) then 'YAN_GOREV_PRESET'
    when coalesce(nullif(trim(matrix_context), ''), 'genel') ~ '^[a-z][a-z0-9_]{1,48}$' then 'OZEL_CODE'
    else 'BILINMEYEN'
  end as tip
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
group by 1
order by atama desc;

-- 2) matrix_context boş/null (olmamalı)
select count(*) as bos_matrix_context
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and (matrix_context is null or trim(matrix_context) = '');
