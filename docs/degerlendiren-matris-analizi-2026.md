# Değerlendiren × Matris Analizi — 2026 EĞİTMEN

**Dönem ID:** `a5bd7005-260f-4ac7-b864-ccc31ca0a5f6`  
**Tarih:** 2026-05-24 (canlı DB okuması)  
**Tekrar çalıştırma:** `sql/degerlendiren-matris-audit.sql`

---

## Nasıl okunur?

| Matris | Anlam |
|--------|--------|
| **genel** | Dönem kategorileri (sınırlı veya tam); görev soruları bu kartta **olmamalı** |
| **sinif_ogretmeni** | Sınıf öğretmeni görev formu |
| **rehberlik_ogretmeni** | Rehber öğretmeni görev formu |
| **zumre** | Zümre başkanı görev formu |
| **kulup_ogretmeni** | Kulüp öğretmeni görev formu |
| **nobetci_ogretmeni** | Nöbetçi öğretmen görev formu |
| **yasam_koordinatoru** | Okul içi yaşam koordinatörü görev formu |
| **formator** | Formatör görev formu |
| **bilimsel_etkinlik_koordinatoru** | Bilimsel etkinlik koordinatörü |
| **okul_yasam** | Yalnızca seçili kategoriler (genel 21 soru değil) |

Aynı **değerlendiren → hedef** çiftinde birden fazla satır **normaldir** (ör. genel + sınıf + rehber).

---

## 1. Tüm değerlendirenler — özet tablo

| Değerlendiren | genel | sınıf | rehber | zümre | kulüp | nöbetçi | yaşam | formatör | bilimsel | okul yaşam | **toplam** |
|---------------|------:|------:|-------:|------:|------:|--------:|------:|---------:|---------:|-----------:|-----------:|
| **Paul GEORGES** | 83 | 39 | 6 | 12 | 45 | 24 | 2 | 4 | 1 | 0 | **216** |
| **Ender ÜSTÜNGEL** | 83 | 39 | 6 | 12 | 45 | 24 | 2 | 4 | 1 | 0 | **216** |
| Onur ERMAN | 77 | 0 | 0 | 0 | 45 | 24 | 0 | 0 | 0 | 0 | 146 |
| Ayşegül KAZMAZ | 77 | 0 | 0 | 0 | 45 | 24 | 0 | 0 | 0 | 0 | 146 |
| Yaprak BENER CHAPDELAINE | 43 | 9 | 2 | 12 | 45 | 24 | 2 | 4 | 1 | 0 | 142 |
| Berna SÖĞÜTLÜ | 44 | 8 | 1 | 12 | 46 | 24 | 2 | 4 | 1 | 0 | 142 |
| Ebru AKTİMUR | 42 | 8 | 1 | 12 | 46 | 24 | 2 | 4 | 1 | 0 | 140 |
| Rengin TAMKAN DOĞAN | 40 | 8 | 2 | 12 | 46 | 24 | 2 | 4 | 1 | 0 | 139 |
| Gülnaz PEKİN | 41 | 6 | 1 | 12 | 46 | 24 | 2 | 4 | 1 | 0 | 137 |
| **Şule KOÇAK** | 83 | 39 | 6 | **0** | **0** | **0** | 2 | **0** | **0** | 0 | **130** |
| Müge SARUHAN ALTINKAYA | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 81 | 85 |
| Simgenur / Jennifer / Aslı Deniz | 0 | … | … | … | … | … | … | … | … | 81 | 81 |
| Utku AYTAÇ | 0 | … | … | … | … | … | … | … | … | 80 | 80 |
| Peggy / Stanislaw / Gökçe / Zeynep | 4–14 | 0 | … | … | … | … | … | … | … | 0 | küçük |

---

## 2. Rol profilleri (kontrol listesi)

### A) Paul GEORGES & Ender ÜSTÜNGEL — tam müdür yardımcısı modeli

- **Genel:** 83 öğretmen (tam sütun)
- **Sınıf:** 39 | **Rehber:** 6 | **Zümre:** 12 | **Kulüp:** 45 | **Nöbetçi:** 24
- **Yaşam koord.:** 2 (Onur ERMAN, Ayşegül KAZMAZ)
- **Formatör:** 4 | **Bilimsel:** 1
- **Genel kapsam kaydı:** yok (tam 9 kategori + görevler ayrı kartlarda)

**Zümre (12):** Altan KILIÇ, Ayhan YAĞIZ, Berna BENER, Gökçe TAYLAN, Gökhan BÜYÜKENGEZ, Onur ERMAN, Peggy MOREL ÖZDEMİR, Stanislaw EON DU VAL, Şule KOÇAK, Yeliz ERARSLAN, Yonca İŞLEK, Zeynep DEDEBAŞ

---

### B) Şule KOÇAK — sınırlı genel + sınıf/rehber (zümre başkanı ama zümre matrisi yok)

| Matris | n | Durum |
|--------|--:|--------|
| genel | 83 | **4 kategori** (aşağıda) |
| sinif_ogretmeni | 39 | Paul/Ender ile aynı sınıf listesi |
| rehberlik_ogretmeni | 6 | Aşağıda isimler |
| yasam_koordinatoru | 2 | Onur ERMAN, Ayşegül KAZMAZ |
| zumre / kulup / nobetci / formator / bilimsel | **0** | **Kasıtlı — yapmayacak** |

**Genel — 4 kategori (81 kişi + istisna 2 kişi):**

1. Mesleki Sorumluluk  
2. Ölçme & Değerlendirme  
3. Veli İletişimi  
4. Öğrenci İlişkileri ve Empati  

**Genel — 5 kategori istisnası (yaşam koordinatörü):**

| Hedef | Kategoriler |
|-------|-------------|
| Onur ERMAN | Mesleki Sorumluluk, Veli İletişimi, Öğrenci İlişkileri ve Empati, Proje/Etkinlik/Kurumsal Katkı, Kurum İçi İletişim |
| Ayşegül KAZMAZ | (aynı 5) |

**Rehber (6):** Doruk ATIŞKAN, Elçin KONUK, Murat KAZANOĞLU, Sevcan ÖZKILINÇ, Şule YENAL, Tolga ÇAKIROĞLU

**Sınıf (39):** Paul/Ender sınıf matrisi ile aynı küme (SQL: `fix-sule-kocak-rehber-sinif-duty-matrices.sql`).

---

### C) Ebru, Gülnaz, Berna, Yaprak, Rengin — blok bazlı dar genel + yan görevler

Hepsi **kulüp 45–46, nöbetçi 24, zümre 12, formatör 4, bilimsel 1, yaşam 2** taşır; **genel ve sınıf/rehber sayıları Excel bloklarına göre daraltılmıştır.**

| Değerlendiren | genel | sınıf | rehber | Not |
|---------------|------:|------:|-------:|-----|
| Ebru AKTİMUR | 42 | 8 | 1 (Elçin KONUK) | Sınıf listesi: Belgin ŞİMŞEK … Zeliha BARLAS (8) |
| Gülnaz PEKİN | 41 | 6 | 1 (Sevcan ÖZKILINÇ) | Sınıf: Ilgın AYDIN … Volkan OĞUZ (6); Evren sınıfta yok |
| Berna SÖĞÜTLÜ | 44 | 8 | 1 (Doruk ATIŞKAN) | Sınıf: Arman … Simge ŞENAY (8) |
| Yaprak BENER CHAPDELAINE | 43 | 9 | 2 (Murat, Tolga) | Sınıf 9; Zeynep sınıf+zümre |
| Rengin TAMKAN DOĞAN | 40 | 8 | 2 (Murat, Şule YENAL) | Zeynep yalnızca zümre; Berna BENER sınıf |

**Sınıf öğretmeni isim listeleri** — bkz. SQL sorgu 2 veya `fix-*-rehber-sinif*.sql` dosyaları.

---

### D) Onur ERMAN & Ayşegül KAZMAZ — değerlendiren olarak

- **Genel 77** + **kulüp 45** + **nöbetçi 24** (md. yrd. modeline benzer yan görevler; sınıf/rehber/zümre yok)
- Birçok hedefte **5 kategorili** genel kapsam (kendi değerlendirdikleri öğretmenler)
- **Şule / Paul / Ender** onları değerlendirirken: genel 5 kategori + ayrı yaşam + (Paul/Ender’de) kulüp

---

### E) Okul yaşam koordinatörleri (kategori matrisi)

| Değerlendiren | okul_yasam | formatör | Genel |
|---------------|----------:|---------:|------:|
| Müge SARUHAN ALTINKAYA | 81 | 4 | 0 |
| Simgenur / Jennifer / Aslı Deniz | 81 | 0 | 0 |
| Utku AYTAÇ | 80 | 0 | 0 |

**Utku:** yalnızca seçili kategoriler (Teknolojik + Proje); genel atama yok.

---

## 3. Genel kategori istisnaları (5 kategori)

Aşağıdaki **6 çift** için `genel` matrisinde **5 kategori** hedef kapsamı tanımlı:

- Paul GEORGES → Onur, Ayşegül  
- Ender ÜSTÜNGEL → Onur, Ayşegül  
- Şule KOÇAK → Onur, Ayşegül  

(Ayrıca Onur/Ayşegül’ün başkalarını değerlendirdiği yüzlerce 5-kategori satırı vardır — koordinatör genel modeli.)

---

## 4. Tutarlılık denetimi — ne hata, ne kasıt?

| Bulgu | Yorum |
|--------|--------|
| Şule’de kulüp/nöbet/zümre “eksik” | **Kasıtlı** — `fix-sule-remove-nobetci-kulup.sql` uygulandı |
| Gülnaz/Berna/…’da bazı sınıf görevlilerinde sinif satırı yok | **Kasıtlı** — dar Excel listesi; genel sütunlarında olmayan veya sadece zümre olanlar |
| Paul = Ender sayıları | **Beklenen** — aynı md. yrd. modeli |
| Şule sinif/rehber = Paul sinif/rehber sayısı | **Beklenen** |
| Genel + görev matrisi aynı çiftte | **Beklenen** — farklı formlar |

**Otomatik “eksik matris” sorgusu** (`degerlendiren-matris-audit.sql` §5) kasıtlı istisnaları da listeler; sonuçları profil tablosuyla birlikte yorumlayın.

---

## 5. Hızlı doğrulama komutları

```sql
-- Şule özeti (nöbetçi/kulüp 0 olmalı)
select coalesce(matrix_context,'genel') matris, count(*) n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
group by 1 order by 2 desc;

-- Tek kişi tam liste
select matrix_context, tg.name
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Ebru AKTİMUR'
order by 1, 2;
```

---

## 6. İlgili SQL dosyaları

| Dosya | Amaç |
|-------|------|
| `sql/degerlendiren-matris-audit.sql` | Tekrarlanabilir denetim sorguları |
| `sql/fix-sule-kocak-rehber-sinif-duty-matrices.sql` | Şule sınıf + rehber |
| `sql/fix-sule-remove-nobetci-kulup.sql` | Şule nöbetçi/kulüp kaldırma |
| `sql/fix-onur-aysegul-genel-5-categories.sql` | 5 kategori istisnası |
| `sql/fix-paul-ender-sinif-duty-matrices.sql` | Paul/Ender sınıf 39 |
| `sql/fix-ebru-rehber-sinif-duty-matrices.sql` | Ebru blok |
| `sql/fix-gulnaz-rehber-sinif-zumre-duty-matrices.sql` | Gülnaz blok |
| `sql/fix-berna-rehber-sinif-zumre-duty-matrices.sql` | Berna blok |
| `sql/fix-yaprak-rehber-sinif-zumre-duty-matrices.sql` | Yaprak blok |
| `sql/fix-rengin-rehber-sinif-zumre-duty-matrices.sql` | Rengin blok |

---

**Sonuç:** Ana md. yrd. profilleri (Paul, Ender, Şule) ve blok md. yrd.’leri (Ebru, Gülnaz, Berna, Yaprak, Rengin) DB’de tanımlı modellerle uyumlu. Şule matrisi doğrulandı. Tam isim listesi (83 genel) için audit SQL §2 kullanın.
