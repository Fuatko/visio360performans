-- VISIO360 - sql/survey-channels.sql geri alma
-- Sıra önemli: kolon referansı önce kalkar.
alter table if exists public.survey_responses drop column if exists channel_id;
drop table if exists public.survey_channels;
