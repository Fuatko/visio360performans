-- ============================================================
-- Değerlendirme türü (period-level)
-- ============================================================
-- Mevcut cevap/puan tablolarına dokunmaz. Eski dönemler varsayılan
-- olarak kişisel gelişim/360 türünde kalır.
-- ============================================================

alter table public.evaluation_periods
  add column if not exists assessment_kind text not null default 'development_360';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'evaluation_periods_assessment_kind_check'
  ) then
    alter table public.evaluation_periods
      add constraint evaluation_periods_assessment_kind_check
      check (assessment_kind in ('development_360', 'job_evaluation', 'other'));
  end if;
end $$;

comment on column public.evaluation_periods.assessment_kind is
  'Evaluation type for reporting separation: development_360, job_evaluation, or other.';

create index if not exists idx_evaluation_periods_assessment_kind
  on public.evaluation_periods(organization_id, assessment_kind);
