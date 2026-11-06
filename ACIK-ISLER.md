# VISIO 360° — Açık işler

Son güncelleme: 4 Kasım 2026

Bu dosya elle tutulur. Bir iş bitince satırı sil, yenisi çıkınca ekle.

## Bekleyen kararlar (Fuat)

- **Yurt dışına aktarımın hukuki dayanağı.** Uygulama Frankfurt'ta
  çalışıyor, veri Türkiye'de. Avukat görüşü bekleniyor. Ayrıntı ve soru
  listesi: KVKK veri aktarımı ve aydınlatma durumu belgesi.
- **Aydınlatma metni.** Çalışanlara onaylatılan metin bir gizlilik
  taahhüdü; aydınlatma metni yok. Taslak hazır, okul onayı bekliyor.
- **Alan bazlı şifreleme.** Şu an yok (`docs/encryption-roadmap.md`
  yalnız yol haritası). Avukat görüşünden sonra karar verilecek: veritabanı
  sızarsa isim/e-posta/puan okunamaz olur, ama şifrelenen alanda arama ve
  sıralama yapılamaz — bazı raporlar elden geçer.
- **Barındırmayı Türkiye'ye almak.** Yurt dışına aktarımı tamamen ortadan
  kaldırır; Vercel'in otomatik dağıtım kolaylıkları kaybedilir. Avukat
  görüşüne bağlı.

## Teknik borç

- **İngilizce çeviriler yok** — 112 kategori, 647 soru. Fransızca'da 5
  mükerrer kategori çevirisi. Acil değil; bir müşteri İngilizce
  istediğinde yalnız o müşterinin soru seti çevrilir (tamamı değil).
- **Lint uyarıları** — 121 uyarı (hatalar temizlendi). Davranışı
  etkilemiyor.
- **`training_catalog` tekillik** — aynı başlığın tekrar girilmesini
  engelleyen tekil indeks ve Türkçe sıralama (collation) yok.
- **Tek sunucu riski** — PostgreSQL tek makinede. Yedekleme var
  (`docs/backup-restore-runbook.md`), yük devretme yok.
- **`evaluation_assignments` / `evaluation_responses` RLS zorunlu değil** —
  RLS açık ama `FORCE` verilmemiş; tablo sahibi `visio360_app` politikaları
  atlıyor. Kurum ayrımı bu iki tabloda yalnız uygulama kodunda zorlanıyor.
  Dönem kurulumundan sonra FORCE açılmalı.

## Veri birikmesini bekleyen özellikler

- **Birim bazlı hedef gerçekleşme raporu** — hedef modülü kullanılmaya
  başlanınca.
- **Potansiyel değerlendirmesi + 9-box** — hedefler bir dönem
  kullanıldıktan sonra. Not: yazılımda yönetici giriş yetkisi olmadığı
  için potansiyel notunu yalnız İK girebilir.
- **PDF raporlarda yönetici rozeti** — kişi satırlarında şu an yalnız
  CSV'de var.

## Bitenler (kayıt için)

- 2026-11-04 — Fonksiyon bölgesi `fra1` (Frankfurt) olarak sabitlendi;
  öncesinde `iad1` (Washington DC) idi.
- 2026-11-03 — İK Modül 2: hedef yönetimi + kurum anahtarı değişiklik
  damgası.
- 2026-11-03 — İK Modül 1: çalışan sonuç özeti ve onay kaydı.
