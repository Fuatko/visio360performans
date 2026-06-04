# Paul GEORGES — operasyonel özet (2026 EĞİTMEN)

Dönem: `a5bd7005-260f-4ac7-b864-ccc31ca0a5f6`  
Güncelleme: canlı DB sorgusu (`scripts/diagnose-paul-pending.mjs`)

## Özet

| Metrik | Değer |
|--------|------:|
| Toplam atama | 218 |
| Bekleyen | 212 |
| Tamamlanan | 6 |
| Genel hedef (toplam) | 85 (= Ender) |
| Genel bekleyen | 82 (öz değerlendirme kaldırıldı) |
| Genel tamamlanan | 2 |
| Yarım kalan (pending + cevap var) | **0** |

## Bekleyen — matrix_context

| matrix_context | bekleyen |
|----------------|--------:|
| genel | 83 |
| kulup_ogretmeni | 44 |
| sinif_ogretmeni | 38 |
| nobetci_ogretmeni | 22 |
| zumre | 12 |
| rehberlik_ogretmeni | 6 |
| formator | 4 |
| yasam_koordinatoru | 2 |
| bilimsel_etkinlik_koordinatoru | 1 |

## Tamamlanan — matrix_context

| matrix_context | tamamlanan |
|----------------|----------:|
| genel | 2 |
| nobetci_ogretmeni | 2 |
| kulup_ogretmeni | 1 |
| zumre | 1 |

**Genel tamamlanan hedefler:** Arman KOMBIYIKYAN, Altan KILIÇ

## Genel parity (Ender)

- Paul genel hedef: **85**
- Ender genel hedef: **85**
- Fark: **yok** (eksik/fazla hedef yok)

## Yarım kalan

`evaluation_responses` tablosunda kayıt olan **bekleyen** atama: **0**  
→ Paul henüz formlarda DB’ye cevap kaydetmemiş (taslak yalnızca tarayıcı localStorage’da olabilir).

## Tam bekleyen genel listesi (83)

Supabase’de §4 çıktısı: `sql/diagnose-paul-pending-operasyon.sql`

Terminal: `node scripts/diagnose-paul-pending.mjs`

Alfabetik (83 kişi — DB’de `evaluation_responses` yok, hepsi başlamamış sayılır):

Ayfer AKAYDIN, Ayhan YAĞIZ, Ayşegül KAZMAZ, Baran YILDIZ, Belgin ŞİMŞEK, Berna BENER, Berna SÖĞÜTLÜ, Binnaz BAYRAK ONUR, Cécile BLANC, Charbel JBEILY, Christine KHOURY, Didem KANDİL, Didem TEKİN, Dilara ADAŞ, Dilek KARAYAĞIZ, Doruk ATIŞKAN, Ebru AKTİMUR, Ebru ÖZGÖREN, Elçin KONUK, Eléonore DE BEAUMONT, Elif CANDEMİR, Elif DİVİTÇİOĞLU, Elif KAZAN, Erhan ATASEVER, Erkan YILMAZ, Esin ALPAN, Fadime ALPARSLAN, Farhad POURMIR, Gökçe TAYLAN, Gökhan BÜYÜKENGEZ, Gökhan KARAMAN, Gülen ERMAN, Gülnaz PEKİN, Gülnur TİRYAKİ, Hande KAHRAMAN, Ilgın AYDIN, Jean-Marie DOLL, Kerem KESEPARA, Laurent CHAPDELAINE, Léa JACQUOT, Leyla CİDAL ALTINAYAR, Loïc VERTUAUX, Maral BASMA, Marie Christine ÇANLI, Mesude YILDIRIM, Mişelin TAGAN, Monique SERİM, Murat KAZANOĞLU, Nesrin KARAKAŞ, Oğuzhan ÇETİN, Olivier ROBERT, Onur ERMAN, Özcan AKÇAKAYA, Patrice CARINO, Peggy MOREL ÖZDEMİR, Rengin TAMKAN DOĞAN, Sabriye ÇAVDARCIOĞLU TOPUZ, Seda UĞUR, Selin KARAKOÇ, Selin YILMAZ, Sevcan ÖZKILINÇ, Simge ŞENAY, Stanislaw EON DU VAL, Stéphanie LEMAIRE, Şahan İZGİ, Şeyma DOĞRUER, Şule KOÇAK, Şule YENAL, Şükran TOY, Tanya ERGÜNEŞ UĞUR, Tolga ÇAKIROĞLU, Tunç ÖNDEMİR, Uğur ÖZEN, Utku AYTAÇ, Volkan OĞUZ, Yaprak BENER CHAPDELAINE, Yeliz ERARSLAN, Yonca İŞLEK, Zeliha BARLAS, Zeliha Mine NART, Zeynep DEDEBAŞ, Zuhal KILIÇASLAN

## Önerilen iş sırası

1. **Genel 83** — tek tip form, FR hazır; önce bunlar
2. **kulup 44 + sinif 38** — görev matrisi kartları
3. **nobetci 22, zumre 12, …** — kalan yan görevler
