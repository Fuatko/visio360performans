# İş değerlendirmesi — soru başına cevap kuralı

## Standart (uygulama + import + formlar)

Her **iş değerlendirmesi** sorusunda formda görünen şıklar:

| Sıra | Tür | Puan (std = reel) | Örnek |
|------|-----|-------------------|--------|
| 1–4 | Performans (puanlı) | **5, 3, 1, 0** | Beklentiyi aşıyor … Hiç karşılamıyor |
| 5 | Bilgim yok / Fikrim yok | **0 / 0** (ortalamaya girmez) | Bilgim yok. / Je ne sais pas. |

- **Toplam aktif şık:** **5** (4 puanlı + 1 bilgim yok)
- «3 puanlı + 1 bilgim» ifadesi bazen **4 performans seviyesini** kasteder; **0 puanlı** performans şıkkı ayrıdır, «Bilgim yok» değildir
- Excel import: her soru için 5 satır (5 / 3 / 1 / 0 performans + Bilgim yok)

## Kod

- `src/lib/evaluation-scale.ts` — `JOB_EVALUATION_PERFORMANCE_SCORES = [5, 3, 1, 0]`, `isJobEvaluationScaleAnswers` → 4 performans + en fazla 1 no_opinion

## Denetim SQL

- `sql/audit-answer-scale-business-rule.sql` — genel + yan görev, tüm dönem soruları

## Yan görev / genel

Aynı `question_answers` tablosu; görev matrisi yalnızca **hangi soruların** gösterileceğini belirler. Şık seti soru bazında aynı kurala uyar.
