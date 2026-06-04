# Matrix soru kapsamı — tam dönem denetim özeti

**Dönem:** 2026 EĞİTMEN_İŞ PERFORMANS DEĞ. (`a5bd7005-260f-4ac7-b864-ccc31ca0a5f6`)  
**Tarih:** 2026-06-02  
**Rapor:** `docs/matrix-scope-audit-report-full.json` (read-only, DB’ye yazılmaz)

## Toplam

| Metrik | Sayı |
|--------|------|
| Kontrol edilen atama | **1981** |
| Genel değerlendirme | 635 |
| Yan görev matrisi | 947 |
| FR tekrarlayan soru metni | 0 |
| Veri hatası (yanlış paket / scope sonrası yanlış soru) | **0** |

## Kritik: eski kod davranışı (deploy öncesi simülasyon)

Dönem modu: **`duty_only`**. Eski kodda **928** yan görev atamasında filtre 0 soru kalıyor, fail-open ile hedefin **tüm** görev soruları yükleniyordu.

**Canlıda** scope + fail-open düzeltmesi deploy edildi (`visio360pds`). Yeni açılan formlar doğru soru setini göstermeli.

| Görev tipi | Etkilenen atama | Pending | Completed |
|------------|-----------------|---------|-----------|
| Kulüp | 399 | 390 | 9 |
| Nöbetçi | 216 | 208 | 8 |
| Sınıf öğretmeni | 152 | 150 | 2 |
| Zümre başkanı | 84 | 81 | 3 |
| Formatör | 32 | 30 | 2 |
| Rehberlik | 21 | 21 | 0 |
| Yaşam koordinatörü | 16 | 14 | 2 |
| Bilimsel etkinlik | 8 | 8 | 0 |

**670** atamada hedefin birden fazla görevi var → fail-open’da **yanlış soru** riski yüksek (ör. Zümre + Kulüp + Nöbet).

### En çok etkilenen değerlendirenler (atama sayısı)

| Değerlendiren | Kritik atama |
|---------------|--------------|
| Ender ÜSTÜNGEL | 130 |
| Paul GEORGES | 129 |
| Yaprak BENER CHAPDELAINE | 98 |
| Berna SÖĞÜTLÜ | 97 |
| Ebru AKTİMUR | 97 |
| Rengin TAMKAN DOĞAN | 96 |
| Gülnaz PEKİN | 95 |
| Onur ERMAN | 68 |
| Ayşegül KAZMAZ | 68 |
| Şule KOÇAK | 45 |

### Çok görevli hedefler (karışma riski en yüksek)

| Hedef | Görevler | Etkilenen atama satırı |
|-------|----------|-------------------------|
| Gökhan BÜYÜKENGEZ | Zümre + Nöbet + Kulüp | 25 |
| Altan KILIÇ | Zümre + Nöbet + Kulüp | 25 |
| Onur ERMAN (hedef) | Zümre + Kulüp + Yaşam koord. | 23 |

## Uyarılar — düzeltildi ✅

**Son denetim:** uyarı **0** (atama 1971).

| Düzeltme | Detay |
|----------|--------|
| Paul LAFORGE | Görev profiline **Kulüp Öğretmeni** eklendi → 9 kulüp değerlendirmesi doğru soru seti |
| Ebru hedef zümre | 6 **pending** atama silindi (hedefte zümre yok) |
| Şule hedef rehberlik | 3 **pending** silindi (hedefte rehber yok) |
| Gökhan hedef sınıf | 1 **pending** silindi (hedefte sınıf öğretmeni yok) |

`node scripts/apply-matrix-warnings-fix.mjs --apply` · `sql/fix-matrix-warnings-pending-safe.sql`

## Tekrar çalıştırma

```bash
node scripts/audit-matrix-question-scope.mjs --json docs/matrix-scope-audit-report-full.json
node scripts/audit-matrix-question-scope.mjs --evaluator "Berna" --pending-only
```

## Operasyon notu

- **Pending** formlar: deploy sonrası sayfayı yenile / gizli pencere.
- **Completed** (~32 yan görev): yanlış soru setiyle doldurulmuş olabilir; otomatik düzelmez, yeniden değerlendirme politikası ayrı karar.
