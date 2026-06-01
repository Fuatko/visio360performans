# İş değerlendirmesi — soru başına **4 şık**

## Kullanıcı kuralı (formda görünen)

| Sıra | Şık | Puan (std = reel) | Ortalamaya girer? |
|------|-----|-------------------|-------------------|
| 1 | **İyi** | 5 | Evet |
| 2 | **Orta** | 3 | Evet |
| 3 | **Zayıf** | 1 | Evet |
| 4 | **Fikrim yok** | 0 / 0 (`no_opinion`) | **Hayır** |

**Toplam: 4 aktif cevap** — dördüncü şık **«Fikrim yok.»** (*Je ne sais pas*).

## Önemli

- **4. şık = Fikrim yok** (0 puan; değerlendirmeye alınmaz)
- «Bilgim yok» eski metin; veritabanında **Fikrim yok.** olmalı
- Çift Fikrim + Bilgim aynı soruda **olmamalı** (5 şık hatası)

## Kod

- `JOB_EVALUATION_NO_OPINION_TEXT_TR = 'Fikrim yok.'`
- `isNoInfoAnswer()` — Fikrim yok / Bilgim yok metnini tanır; ortalamadan çıkarır

## Excel import

1. Puan **5** — İyi  
2. Puan **3** — Orta  
3. Puan **1** — Zayıf  
4. **Fikrim yok** (0; `no_opinion`)

## Denetim / düzeltme (Supabase)

| Dosya | Amaç |
|-------|------|
| `sql/fix-dedupe-fikrim-bilgim-4-sik.sql` | 4 şık + tek Fikrim yok |
| `sql/fix-rename-no-opinion-to-fikrim-yok.sql` | Metni Bilgim → Fikrim yap |
| `sql/audit-duplicate-fikrim-bilgim-by-category.sql` | Kategori bazlı denetim |
