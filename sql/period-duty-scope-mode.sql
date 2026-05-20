-- Dönemde görev bazlı soru kapsamı: additive (dönem + görev) | duty_only (yalnız görev paketi)
alter table public.evaluation_periods
  add column if not exists duty_scope_mode text not null default 'additive';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'evaluation_periods_duty_scope_mode_check'
  ) then
    alter table public.evaluation_periods
      add constraint evaluation_periods_duty_scope_mode_check
      check (duty_scope_mode in ('additive', 'duty_only'));
  end if;
exception when others then
  null;
end $$;

comment on column public.evaluation_periods.duty_scope_mode is
  'additive: dönem soruları + görev paketi; duty_only: hedefte görev varsa yalnız görev paketi';
