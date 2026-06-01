# Değerlendirme Matris Rehberi — 2026 EĞİTMEN

> **Supabase SQL Editor’a yapıştırmayın.** Bu dosya Markdown dokümantasyonudur (`#` başlık işaretidir, SQL değil).  
> Sorgu çalıştırmak için repo’daki **`sql/*.sql`** dosyalarını açıp yalnızca SQL içeriğini yapıştırın (ör. `sql/degerlendiren-matris-audit.sql`).

**Dönem ID:** `a5bd7005-260f-4ac7-b864-ccc31ca0a5f6`  
**Son canlı okuma:** 2026-05-28  
**Amaç:** Değerlendiren–hedef eşleşmelerini, genel değerlendirme ile yan görev matrislerini ve kategori kurallarını tek yerde görmek; yanlış atamayı önlemek.

| Doküman | İçerik |
|---------|--------|
| **Bu dosya** | Kavramlar, kurallar, özet tablolar, rol profilleri |
| [`ekler/degerlendirme-matris-isim-listeleri-2026.md`](ekler/degerlendirme-matris-isim-listeleri-2026.md) | Her değerlendiren için **tüm isim listeleri** (matris matris) |
| [`degerlendiren-matris-analizi-2026.md`](degerlendiren-matris-analizi-2026.md) | Kilit notları ve SQL dosya indeksi |
| `sql/degerlendiren-matris-audit.sql` | Tekrarlanabilir denetim sorguları |

**Listeleri yenilemek:**

```bash
SUPABASE_DB_URL="postgresql://..." node scripts/export-degerlendirme-matris-docs.mjs
```

---

## 1. Temel kavramlar

### 1.1 Değerlendiren ve hedef

- **Değerlendiren:** Formu dolduran kişi (satır / satır sorumlusu).
- **Hedef:** Değerlendirilen kişi (sütun).
- Bir kişi hem değerlendiren hem hedef olabilir (ör. Paul → Ender genel, Ender → Paul genel).

### 1.2 Matris bağlamı (`matrix_context`)

Her **değerlendiren + hedef + matris** kombinasyonu ayrı bir **atama** satırıdır. Aynı ikili için birden fazla satır **normaldir**:

| Örnek | Anlam |
|-------|--------|
| Paul → Ayşegül **genel** | Dönem kategorileri (genel performans) |
| Paul → Ayşegül **yasam_koordinatoru** | Yaşam koordinatörü **görev formu** |
| Paul → Ayşegül **kulup_ogretmeni** | Kulüp görevi (varsa) |

**Kural:** Genel kartta yalnızca dönem kategorileri; görev soruları **yan görev** matrislerinde (sınıf, zümre, kulüp, …).

### 1.3 Matris türleri (sözlük)

| Kod | Türkçe ad | Ne ölçülür? |
|-----|-----------|-------------|
| `genel` | Genel değerlendirme | Dönem performans kategorileri (9 veya kısıtlı alt küme) |
| `okul_yasam` | Okul yaşam | Yalnızca seçili 1–2 kategori (tam 21 soru değil) |
| `sinif_ogretmeni` | Sınıf öğretmeni | Sınıf öğretmenliği görev formu |
| `rehberlik_ogretmeni` | Rehber öğretmeni | Rehberlik görev formu |
| `zumre` | Zümre başkanı | Zümre başkanlığı görev formu |
| `kulup_ogretmeni` | Kulüp öğretmeni | Kulüp görev formu |
| `nobetci_ogretmeni` | Nöbetçi öğretmen | Nöbet görev formu |
| `yasam_koordinatoru` | Yaşam koordinatörü | Okul içi yaşam koordinatörlüğü formu |
| `formator` | Formatör | Formatör görev formu |
| `bilimsel_etkinlik_koordinatoru` | Bilimsel etkinlik | Bilimsel etkinlik koordinatörlüğü formu |

### 1.4 Kurum görev tanımları (hedef kişinin ünvanı)

Dönemde tanımlı **görev paketleri** (kaç kişide var):

| Görev | Kod | Kişi sayısı |
|-------|-----|------------:|
| Kulüp Öğretmeni | gorev_7 | 46 |
| Sınıf Öğretmeni | gorev_6 | 39 |
| Nöbetçi Öğretmen | gorev_3 | 24 |
| Zümre Başkanı | gorev_8 | 12 |
| Rehber Öğretmen | gorev_5 | 6 |
| Formatör | gorev_2 | 4 |
| Okul İçi Yaşam Koordinatörü | gorev_4 | 2 |
| Bilimsel Etkinlikler Koordinatörü | gorev_1 | 1 |

> Görev ünvanı, kişinin kurumda hangi **yan form**lara konu olduğunu gösterir. **Kim kimi değerlendirir** ise `evaluation_assignments` tablosundaki atamalardır; ikisi birlikte yorumlanır.

---

## 2. Genel değerlendirme — kategori modelleri

Genel matriste hedef başına hangi **kategorilerin** sorulacağı `evaluation_period_evaluator_target_categories` ile sınırlanabilir. Kısıt yoksa değerlendiren **tüm 9 dönem kategorisini** görür.

| Model | Kim (değerlendiren) | Hedef | Kategori sayısı | Not |
|-------|---------------------|-------|----------------:|-----|
| **Tam genel** | Paul, Ender | Çoğu öğretmen (~83) | 9 (varsayılan) | Hedef özel kayıt yok (`0` satır = tam set) |
| **Tam genel + istisna** | Paul, Ender, Şule | Onur, Ayşegül | **5** | MD → koordinatör genel puana girer |
| **MD 4 kategori** | Şule | ~81 öğretmen | **4** | Mesleki, Ölçme, Veli, Öğrenci |
| **Yaşam koord. 8** | Onur, Ayşegül | 77 öğretmen | **8** | Pedagojik, Ölçme, Teknolojik, Veli, Öğrenci, Proje, Kurum, Mesleki Sorumluluk — **Mesleki Gelişim yok** — **KİLİTLİ** |
| **Zümre başkanı ekip dışı 7** | Zümre başkanları (genel sütun) | Ekip dışı öğretmenler | **7** | Veli + Öğrenci **yok**; Mesleki Gelişim **var** |
| **Zümre başkanı kendi ekip** | Zümre başkanları | Kendi zümre ekibi | Değişken (4–9) | Kişiye göre dar liste |
| **Blok MD genel** | Ebru, Gülnaz, Berna, Yaprak, Rengin | Excel blokları | Tam veya kısıtlı | Sayılar profil tablosunda |

**Karıştırılmaması gerekenler:**

- Onur/Ayşegül **değerlendirirken** → **8** kategori.  
- Onur/Ayşegül **hedef iken** (Paul/Ender/Şule) → **5** kategori.  
- Onur aynı zamanda zümre başkanı; genel sütunda artık **yaşam koordinatörü 8’li set** geçerli (77 hedefin tamamı).

---

## 3. Tüm değerlendirenler — özet (2026-05-28)

| Değerlendiren | genel | sınıf | rehber | zümre | kulüp | nöbetçi | yaşam | formatör | bilimsel | okul_yasam | **toplam** |
|---------------|------:|------:|-------:|------:|------:|--------:|------:|---------:|---------:|-----------:|-----------:|
| Paul GEORGES | 85 | 39 | 6 | 14 | 46 | 24 | 2 | 4 | 1 | 0 | **221** |
| Ender ÜSTÜNGEL | 85 | 39 | 6 | 14 | 46 | 24 | 2 | 4 | 1 | 0 | **221** |
| Ayşegül KAZMAZ | 77 | 0 | 0 | 0 | 46 | 24 | 0 | 0 | 0 | 0 | **147** |
| Onur ERMAN | 77 | 0 | 0 | 0 | 46 | 24 | 0 | 0 | 0 | 0 | **147** |
| Rengin TAMKAN DOĞAN | 37 | 8 | 2 | 14 | 47 | 24 | 2 | 4 | 1 | 0 | **139** |
| Berna SÖĞÜTLÜ | 36 | 8 | 1 | 14 | 47 | 24 | 2 | 4 | 1 | 0 | **137** |
| Yaprak BENER CHAPDELAINE | 33 | 9 | 2 | 14 | 46 | 24 | 2 | 4 | 1 | 0 | **135** |
| Ebru AKTİMUR | 34 | 8 | 1 | 13 | 47 | 24 | 2 | 4 | 1 | 0 | **134** |
| Gülnaz PEKİN | 32 | 6 | 1 | 14 | 47 | 24 | 2 | 4 | 1 | 0 | **131** |
| Şule KOÇAK | 83 | 39 | 5 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | **129** |
| Müge SARUHAN ALTINKAYA | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 81 | **85** |
| Simgenur / Jennifer / Aslı Deniz | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 81 | **81** |
| Utku AYTAÇ | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 80 | **80** |
| Peggy MOREL ÖZDEMİR | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **15** |
| Stanislaw EON DU VAL | 13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **13** |
| Zeynep DEDEBAŞ | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **8** |
| ~~Erkan YILMAZ~~ | — | — | — | — | — | — | — | — | — | — | **Çıkarıldı** (zümre başkanı değil; `fix-erkan-remove-zumre-baskan-role.sql`) |
| Gökçe TAYLAN | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **8** |
| Diğer zümre başkanları | 1–4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0–1 | 0 | **1–5** |

> **Toplam atama satırı (DB):** 2019.  
> Tam isimler: [`ekler/degerlendirme-matris-isim-listeleri-2026.md`](ekler/degerlendirme-matris-isim-listeleri-2026.md).

---

## 4. Rol profilleri

### 4.1 Paul GEORGES & Ender ÜSTÜNGEL — tam müdür yardımcısı

| Matris | Sayı | Açıklama |
|--------|-----:|----------|
| genel | 85 | Tüm öğretmen sütunu (+ md. yrd. / koordinatör istisnaları dahil) |
| sinif_ogretmeni | 39 | Sınıf öğretmeni görevi olanlar |
| rehberlik_ogretmeni | 6 | 6 rehber öğretmen |
| zumre | 14 | Zümre başkanı görevi (12 ünvan + ek satırlar olabilir) |
| kulup_ogretmeni | 46 | Tüm kulüp öğretmenleri |
| nobetci_ogretmeni | 24 | Tüm nöbetçiler |
| yasam_koordinatoru | 2 | **Onur ERMAN**, **Ayşegül KAZMAZ** |
| formator | 4 | 4 formatör |
| bilimsel_etkinlik_koordinatoru | 1 | 1 koordinatör |

**Genel kategori:** Çoğu hedefte kısıt yok (9 kategori). **Onur** ve **Ayşegül** hedef iken **5 kategori** (KİLİTLİ).

**Zümre hedefleri (14):** Ek dosyada Paul/Ender → zümre bölümü; örnek isimler: Altan KILIÇ, Ayhan YAĞIZ, Berna BENER, Gökçe TAYLAN, Gökhan BÜYÜKENGEZ, Onur ERMAN, Peggy MOREL ÖZDEMİR, Stanislaw EON DU VAL, Şule KOÇAK, Yeliz ERARSLAN, Yonca İŞLEK, Zeynep DEDEBAŞ, …

---

### 4.2 Şule KOÇAK — sınırlı genel + sınıf/rehber/yaşam

| Matris | Sayı | Durum |
|--------|-----:|--------|
| genel | 83 | **4 kategori** (81 kişi + Onur/Ayşegül istisnası 5) |
| sinif_ogretmeni | 39 | Paul/Ender ile **aynı** 39 kişi |
| rehberlik_ogretmeni | 5 | Doruk ATIŞKAN, Elçin KONUK, Murat KAZANOĞLU, Sevcan ÖZKILINÇ, Tolga ÇAKIROĞLU (**Şule YENAL yok**) |
| yasam_koordinatoru | 2 | Onur, Ayşegül |
| zumre / kulup / nobetci / formator / bilimsel | **0** | **Kasıtlı** — değerlendirmez |

---

### 4.3 Onur ERMAN & Ayşegül KAZMAZ — yaşam koordinatörü (KİLİTLİ)

| Matris | Sayı |
|--------|-----:|
| genel | 77 |
| kulup_ogretmeni | 46 |
| nobetci_ogretmeni | 24 |

- **Genel → öğretmen:** 77 hedef × **8 kategori** (`tam_8=77`).  
- **MD → koordinatör:** Paul, Ender, Şule → genel **5 kategori** (`durum=OK`).  
- Sınıf / rehber / zümre / formatör matrisi **yok**.

---

### 4.4 Ebru, Gülnaz, Berna, Yaprak, Rengin — blok müdür yardımcısı

Ortak yan görevler: **kulüp ~46–47, nöbetçi 24, zümre 13–14, formatör 4, bilimsel 1, yaşam 2**.

| Değerlendiren | genel | sınıf | rehber | Özel not |
|---------------|------:|------:|-------:|----------|
| Ebru AKTİMUR | 34 | 8 | 1 | Rehber: Elçin KONUK; ekip dışı 7 kategori (30 hedef) |
| Gülnaz PEKİN | 32 | 6 | 1 | Rehber: Sevcan ÖZKILINÇ |
| Berna SÖĞÜTLÜ | 36 | 8 | 1 | Rehber: Doruk ATIŞKAN |
| Yaprak BENER CHAPDELAINE | 33 | 9 | 2 | Rehber: Murat, Tolga |
| Rengin TAMKAN DOĞAN | 37 | 8 | 2 | Rehber: Murat, Şule YENAL |

Dar **sınıf** ve **genel** listeleri Excel bloklarına göre; tam isimler ek dosyada.

---

### 4.5 Okul yaşam koordinatörleri (KİLİTLİ)

| Değerlendiren | okul_yasam | formatör | Genel | Kategoriler (okul_yasam) |
|---------------|----------:|---------:|------:|--------------------------|
| Simgenur GÜDEBERK KORKMAZ | 81 | 0 | 0 | Proje, Etkinlik ve Kurumsal Katkı |
| Jennifer COLOMB ŞENER | 81 | 0 | 0 | (aynı) |
| Aslı Deniz DELİKANLI | 81 | 0 | 0 | (aynı) |
| Müge SARUHAN ALTINKAYA | 81 | 4 | 0 | Kurum İçi + Mesleki Gelişim (bilinçli fark) |
| Utku AYTAÇ | 80 | 0 | 0 | Teknolojik + Proje (**kendisi hariç**) |

**81 hedef listesi** üç koordinatörde aynı; Müge’de kategori seti farklı; Utku’da 80 hedef.

---

### 4.6 Zümre başkanları — dar genel sütun

Zümre başkanlarının çoğu **yalnızca kendi ekibini** genel sütunda değerlendirir (2–15 hedef). **Ekip dışı** öğretmenlerde **7 kategori** kuralı uygulanır (Veli / Öğrenci yok).

| Değerlendiren | genel | bilimsel | Not |
|---------------|------:|---------:|-----|
| Peggy MOREL ÖZDEMİR | 15 | 0 | Geniş ekip dışı listesi |
| Stanislaw EON DU VAL | 13 | 0 | |
| Zeynep DEDEBAŞ | 8 | 0 | Kendi ekip 8 |
| Erkan YILMAZ | — | — | Zümre başkanı değil — matris dışı |
| Gökçe TAYLAN | 8 | 0 | Kendi ekip 8 |
| Berna BENER | 4 | 1 | |
| Yeliz / Yonca | 4 | 0 | |
| Gökhan / Altan | 2 | 0 | |
| Ayhan YAĞIZ | 1 | 0 | |

Paul/Ender **zümre** matrisinde bu kişileri **görev formu** ile değerlendirir; genel sütunları ayrıdır.

---

## 5. Çoklu matris örneği (aynı hedef)

**Paul GEORGES → Ayşegül KAZMAZ** için tipik satırlar:

| Matris | Amaç |
|--------|------|
| genel | 5 kategori — genel performans (MD modeli) |
| yasam_koordinatoru | Yaşam koordinatörlüğü görev soruları |
| kulup_ogretmeni | Kulüp görevi (varsa ünvanda) |

**Ayşegül KAZMAZ → rastgele öğretmen** için tipik satır:

| Matris | Amaç |
|--------|------|
| genel | 8 kategori — yaşam koordinatörü genel modeli |

---

## 6. Yanlış atama kontrol listesi

| # | Kontrol | Beklenen |
|---|---------|----------|
| 1 | Şule’de kulüp / nöbet / zümre | **0** |
| 2 | Onur/Ayşegül genel kategori | Tüm 77 hedef **8**, Mesleki Gelişim yok |
| 3 | Paul/Ender/Şule → Onur/Ayşegül genel | **5** kategori |
| 4 | Okul yaşam: Utku hedef sayısı | **80** (Utku hariç) |
| 5 | Öz değerlendirme | Atama yok (evaluator ≠ target aynı matriste) |
| 6 | Genel + görev aynı çift | **İzinli** — farklı formlar |
| 7 | Rehberlik: Şule listesi | **5** kişi (Şule YENAL rehber matrisinde değil) |
| 8 | Zümre başkanı genel 7 kategori | Yalnızca **ekip dışı** hedeflerde |
| 9 | Paul = Ender sayıları | Aynı md. yrd. modeli |
| 10 | Listeyi güncelledikten sonra | `export-degerlendirme-matris-docs.mjs` çalıştır |

---

## 7. Doğrulama SQL’leri (Supabase SQL Editor)

Dosya yolunu IDE’den açın; **tüm `.md` dosyasını değil**, yalnızca ilgili `.sql` dosyasının içeriğini Editor’a yapıştırın.

| Amaç | Dosya |
|------|--------|
| Tüm değerlendiren özet sayıları | `sql/degerlendiren-matris-audit.sql` → **bölüm 1** |
| Tek kişi isim listesi | Aynı dosya → **bölüm 2** (`Şule KOÇAK` adını değiştirin) |
| Yaşam koord. 8 kategori kilidi | `sql/diagnose-yasam-koordinator-genel-8-kilit-dogrula.sql` |
| Okul yaşam kilidi | `sql/diagnose-okul-yasam-koordinatorler-kilit-dogrula.sql` |

Hızlı özet (kopyala-yapıştır):

```sql
select u.name as degerlendiren,
  count(*) filter (where coalesce(ea.matrix_context, 'genel') = 'genel') as genel,
  count(*) filter (where ea.matrix_context = 'sinif_ogretmeni') as sinif,
  count(*) filter (where ea.matrix_context = 'rehberlik_ogretmeni') as rehber,
  count(*) filter (where ea.matrix_context = 'zumre') as zumre,
  count(*) filter (where ea.matrix_context = 'kulup_ogretmeni') as kulup,
  count(*) filter (where ea.matrix_context = 'nobetci_ogretmeni') as nobetci,
  count(*) filter (where ea.matrix_context = 'yasam_koordinatoru') as yasam,
  count(*) filter (where ea.matrix_context = 'formator') as formator,
  count(*) filter (where ea.matrix_context = 'bilimsel_etkinlik_koordinatoru') as bilimsel,
  count(*) as toplam
from evaluation_assignments ea
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
group by u.name
order by toplam desc;
```

---

## 8. İlgili düzeltme dosyaları (seçme)

| Konu | SQL |
|------|-----|
| Yaşam koord. genel 8 kategori | `fix-yasam-koordinator-genel-8-kategoriler.sql` |
| MD → Onur/Ayşegül 5 kategori | `fix-onur-aysegul-genel-5-categories.sql` |
| Şule sınıf/rehber/yaşam | `fix-sule-kocak-rehber-sinif-duty-matrices.sql` |
| Şule kulüp/nöbet kaldır | `fix-sule-remove-nobetci-kulup.sql` |
| Zümre başkan ekip dışı 7 kategori | `fix-zumre-baskan-dis-ekip-7-kategoriler.sql` |
| Okul yaşam | `diagnose-okul-yasam-koordinatorler.sql` |
| Erkan zümre başkanı çıkarma | `fix-erkan-remove-zumre-baskan-role.sql` |

---

**Özet:** Bu rehber yapıyı ve kuralları anlatır; **bire bir isim listeleri** ek dosyada tutulur. Matris veya görev değişikliğinden sonra export script’ini çalıştırıp bu dosyadaki özet tabloyu audit SQL ile karşılaştırın.
