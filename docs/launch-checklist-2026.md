# Visio360 — Yayın öncesi kontrol listesi (2026 dönemi)

**Dönem:** `a5bd7005-260f-4ac7-b864-ccc31ca0a5f6` — 2026 EĞİTMEN_İŞ PERFORMANS DEĞ.

## Kod düzeltmesi (bu commit)

Zümre, Sınıf Öğretmeni ve Rehberlik matrisleri artık `matrix_context = genel` yerine ayrı bağlam kullanıyor:

| Matris kutusu | `matrix_context` |
|---------------|------------------|
| Genel | `genel` |
| Okul yaşam (kategori kapsamı) | `okul_yasam` |
| Zümre | `zumre` |
| Sınıf öğretmeni | `sinif_ogretmeni` |
| Rehberlik | `rehberlik_ogretmeni` |
| Nöbetçi | `nobetci_ogretmeni` |
| Kulüp | `kulup_ogretmeni` |
| Formatör | `formator` |
| Yaşam koordinatörü | `yasam_koordinatoru` |
| Bilimsel etkinlik | `bilimsel_etkinlik_koordinatoru` |

**Neden önemli:** Aynı değerlendiren→hedef çifti hem genel hem zümre matrisinde olabilmeli. Eskiden zümre/sınıf/rehber `genel` ile çakışıyordu; ikinci import atlanıyor veya yanlış form açılıyordu.

## Supabase’de çalıştırın (sıra)

1. `sql/launch-audit.sql` — rapor bölümlerini kaydedin  
2. `sql/fix-matrix-context-legacy.sql` — güvenli context düzeltmeleri  
3. Eksik çiftler için Admin → Matris → ilgili Excel’i **yeniden yükleyin** (`replace_pending` kapalı)  
4. `sql/patch-veli-iletisimi-fr.sql` (henüz çalışmadıysa)  
5. `sql/sync-snapshot-fr-from-live.sql` veya Admin → **İçerik kilitle (snapshot)** yenile  
6. `sql/assignment-matrix-context.sql` (sütun yoksa)

## Fransızca (FR)

- Form dili: **değerlendirenin** `preferred_language` alanı (`fr` → soru/kategori/cevap `*_fr`, yoksa Türkçe).
- Snapshot’ta `text_fr` / `name_fr` dolu olmalı; `launch-audit.sql` bölüm 10–11 eksikleri gösterir.

## Admin doğrulama (örnek)

1. **Değerlendirmelerim:** Bilimsel satırı «Bilimsel Etkinlik Koordinatörü», genel satırı ayrı.  
2. **Matris → Kapsam raporu:** Birim seç → «Bu birimi hesapla» → göz ikonu: genel ≈21 + yan görev soruları.  
3. FR kullanıcı ile bir form açın: kategori ve cevaplar Fransızca.

## Yerel audit script (service role gerekir)

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/launch-audit.mjs
```

`.env.local` içinde anahtar yoksa yalnızca SQL audit kullanın.
