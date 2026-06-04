# Paul GEORGES — Fransızca içerik düzeltmesi (adım adım)

Dönem: `a5bd7005-260f-4ac7-b864-ccc31ca0a5f6`  
Canlı: https://visio360pds.vercel.app

## Kök neden

Birçok soruda `text_fr` alanı **gerçek çeviri** yerine **kategori başlığının FR metni** (`Responsabilité professionnelle`, `Suivi du développement des élèves`, vb.) olarak kayıtlıydı. Formda tüm sorular aynı cümleyi gösteriyordu.

## ADIM 1 — Genel değerlendirme (tamamlandı)

| Kontrol | Sonuç |
|--------|--------|
| Dönem havuzu soru sayısı | 21 |
| Benzersiz FR soru metni | 21 / 21 |
| Tekrarlayan FR metin | 0 |
| Boş FR | 0 |

**Uygulama:** `data/corporate-2026-questions-fr.json` (69 kayıt) → `questions` + `evaluation_period_questions_snapshot`

```bash
node scripts/apply-corporate-2026-fr-questions.mjs --apply
node scripts/diagnose-paul-form-content.mjs
```

**Kod:** Formda kategori-etiketi FR’yi soru sanmaması için `pickLocalizedQuestionText` (`src/lib/evaluation-fr-content.ts`) evaluation sayfasına bağlandı.

## ADIM 2 — Yan görevler (tamamlandı — veri)

48 yan görev sorusu (sınıf öğretmeni, zümre, nöbetçi, kulüp, rehberlik, vb.) aynı JSON ile güncellendi.

| Kontrol | Sonuç |
|--------|--------|
| Duty kategori soruları | 48 |
| Benzersiz FR | 48 / 48 |
| Tekrarlayan FR | 0 |

Her matrix bağlamı (`sinif_ogretmeni`, `zumre_baskani`, `nobetci_ogretmeni`, …) API’de yalnızca ilgili duty kategorilerini yükler; metinler artık soru bazında farklı.

## Paul test checklist

1. Gizli pencere → https://visio360pds.vercel.app  
2. Paul GEORGES (`preferred_language=fr`) ile giriş  
3. **Genel** bir hedef: ~21 soru, her biri farklı FR cümle (kategori başlığı değil)  
4. **Sınıf / zümre / nöbet** kartı: duty bandı FR + o göreve özel sorular  
5. Gönder: «48 cevaplanmamış» hatası olmamalı (genel scope düzeltmesi deploy’da)

## Geri alma / yeniden uygulama

- FR kaynağı: `data/corporate-2026-questions-export.json` + `data/corporate-2026-questions-fr.json`
- **Çalıştırmayın:** `fix-fr-harmonize-texts-from-existing.sql` (kategori adını soruya kopyalar)
