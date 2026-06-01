# İş değerlendirmesi — soru başına **4 şık**

## Kullanıcı kuralı (formda görünen)

| Sıra | Şık | Puan (std = reel) | Ortalamaya girer? |
|------|-----|-------------------|-------------------|
| 1 | **İyi** | 5 | Evet |
| 2 | **Orta** | 3 | Evet |
| 3 | **Zayıf** | 1 | Evet |
| 4 | **Bilgim yok** | 0 / 0 (`no_opinion`) | **Hayır** |

**Toplam: 4 aktif cevap** — dördüncü şık her zaman «Bilgim yok» / «Fikrim yok» / *Je ne sais pas*.

## Önemli

- **4. şık = Bilgim yok** (gözlem yok; puanlama yok)
- **«0» puanlı ayrı bir performans şıkkı bu modelde yok** — zayıf uç **1** puandır
- Veritabanında bazı eski kayıtlarda ekstra **0 performans** satırı + Bilgim yok = **5 satır** olabilir; formda fazla şık görünür → denetimde `FAZLA_0_PERFORMANS` olarak işaretlenir

## Kod

- `src/lib/evaluation-scale.ts` — `isJobEvaluationScaleAnswers()`: **5+3+1 + Bilgim yok (4 aktif)** veya genişletilmiş **5,3,1,0 + Bilgim yok**
- `isNoInfoAnswer()` — metin / `level` ile Bilgim yok ayırır; ortalamadan çıkarır

## Excel import

Her soru **4 satır:**

1. Puan **5** — İyi  
2. Puan **3** — Orta  
3. Puan **1** — Zayıf  
4. **Bilgim yok** (puan yok; `no_opinion`)

## Denetim (Supabase)

| Dosya | Amaç |
|-------|------|
| `sql/audit-answer-scale-business-rule.sql` | 4 şık (5,3,1 + Bilgim yok) |
| `sql/audit-zero-not-bilgim-yok.sql` | 0 puanı Bilgim yok sanılmış satırlar |
| `sql/audit-no-opinion-full-report.sql` | Genel + yan görev, canlı + snapshot |
