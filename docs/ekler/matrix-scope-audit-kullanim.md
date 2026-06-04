# Matrix soru kapsamı denetimi (read-only)

Canlı değerlendirme devam ederken **veritabanına yazmaz**; yalnızca rapor üretir.

## Çalıştırma

```bash
# Tüm dönem (varsayılan period: kurumsal 2026)
node scripts/audit-matrix-question-scope.mjs

# Sadece bekleyen atamalar
node scripts/audit-matrix-question-scope.mjs --pending-only

# Tek değerlendiren
node scripts/audit-matrix-question-scope.mjs --evaluator "Berna" --pending-only

# JSON çıktı
node scripts/audit-matrix-question-scope.mjs --json docs/matrix-scope-audit-report.json
```

## Ne kontrol eder?

| Kod | Anlam |
|-----|--------|
| `FAIL_OPEN_WRONG_SET` | **Kritik** — `duty_only` dönemde filtre 0 soru kalıyor; eski kod fail-open ile hedefin **tüm** görev sorularını gösteriyor (zümre kartında kulüp vb.) |
| `WRONG_DUTY_IN_FORM` | Filtre sonrası hâlâ yanlış görev sorusu |
| `TARGET_MISSING_DUTY` | Matris satırı var, hedefin görev profilinde o görev yok |
| `DUTY_PACKAGE_MISSING` | Dönemde o matrix için görev paketi tanımlı değil |
| `MISSING_EXPECTED_QUESTIONS` | Beklenen soru eksik |

## Berna → Altan örneği

Altan’da **Zümre + Kulüp + Nöbet** görevleri var. Zümre atamasında (`matrix_context=zumre`) beklenen **8** soru; fail-open ile **18** soru (kulüp/nöbet dahil) yüklenebiliyordu.

## Güvenli düzeltme sırası

1. **Kod deploy** (`visio360pds`) — scope etiketleme + fail-open kapatma (yanlış görev karışımı)
2. Denetimi tekrar çalıştır → kritik sayısı 0’a inmeli
3. Veri düzeltmesi yalnızca gerekirse: `evaluation_assignments` / scope tabloları — **tamamlanmış** değerlendirmelere ve `evaluation_responses` kayıtlarına dokunmayın

## İlgili scriptler

- `scripts/launch-audit.mjs` — atama / FR snapshot özeti
- `scripts/apply-corporate-2026-fr-questions.mjs` — FR soru metinleri (ayrı konu)
