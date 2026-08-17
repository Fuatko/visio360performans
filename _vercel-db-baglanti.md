# Vercel → DB bağlantı yolu — Inspira360X modeli + Visio360 önerisi (ANALİZ, uygula YOK)

> Kesişin ön-koşulu. Kaynak: `Projects/inspira360x/lib/supabase/turkey-db.ts` + env.

## 1. INSPIRA360X'İN ÇÖZÜMÜ (gerçekte ne yapıyor)

`turkey-db.ts` → `pg.Pool`:
```
host: TURKEY_DB_HOST      = db.inspira360x.com   ← DOMAIN (ham IP değil)
port: TURKEY_DB_PORT      = 5432
user: inspira_app         ← superuser DEĞİL (uygulama rolü)
ssl : require → { rejectUnauthorized: false }     ← şifreli AMA cert doğrulaması KAPALI
```
- **Firewall / dinamik IP:** Havuzda IP-allowlist, tünel, proxy, static-egress
  **YOK.** Vercel'in dinamik IP'sini "aşmıyor" — **portu IP ile hiç kısıtlamayarak**
  aşıyor. Yani PG portu pratikte **internete açık**; her IP'den (Vercel dahil) erişilebiliyor.
  Koruma: SSL + güçlü parola + app-rolü + (sunucuda) muhtemelen scram/fail2ban.
- **SSL:** `require` = kanal şifreli, ama `rejectUnauthorized:false` → **sunucu
  sertifikası DOĞRULANMIYOR** (self-signed kabul). MITM'e teorik açık.
- **Domain kullanıyor** (`db.inspira360x.com`) → DNS var → Let's Encrypt mümkün
  (henüz doğrulama kapalı olsa da altyapı hazır).
- Multi-tenant: `set_config('app.tenant_id', $1, false)` — dikkat: **`false` =
  session-level** (tx-local değil). Havuzda kapsam sızıntısı riski. (Visio360'ın
  withActor'ı `true`=LOCAL kullanıyor → bu yönden Visio360 DAHA doğru; kopyalama.)

**Özet:** Inspira360X modeli = "PG portu internete açık + SSL-require(doğrulamasız)
+ güçlü parola + app-rolü". Basit, çalışıyor, ama iki zayıf nokta: (a) doğrulanmayan
TLS, (b) internete tam açık port.

## 2. AYNISI VISIO360'A UYGULANIR MI? — EVET, birebir

- Aynı sağlayıcı (pnCloud), aynı Vercel, aynı `pg.Pool` deseni. Model 1:1 taşınır.
- Visio360 `db.ts` zaten aynı SSL desenini kullanıyor (`rejectUnauthorized:false`).
- Tek farklar (ikisi de Visio360 LEHİNE, korunmalı/iyileştirilmeli):
  - Visio360 **ham IP:35342** ile bağlanıyor; Inspira **domain:5432**.
    35342 (standart-dışı port) bot taramasını azaltır → **koru**. Ama doğrulanabilir
    TLS için **domain şart** (cert ham IP'yi doğrulayamaz) → Bölüm 4.
  - Visio360 withActor `SET LOCAL` (tx-local) → Inspira'nın session-level bug'ı Visio360'da yok.

## 3. "İNTERNETE AÇIK + SSL + GÜÇLÜ PAROLA" KABUL EDİLEBİLİR Mİ? — dürüst değerlendirme

**Kısa cevap:** Evet, mevcut ölçek için KABUL EDİLEBİLİR — Inspira360X zaten bunu
prod'da koşuyor — **ANCAK tek anlamlı iyileştirmeyle: doğrulanabilir TLS.**

Neden kabul edilebilir (şartlı):
- Serverless→managed-DB'de private-network yapılamadığında yaygın pragmatik yol.
- Şu koşullarla makul: `hostssl`-only (düz bağlantı yok) + **scram-sha-256** + uzun
  rastgele parola + app-rolü (NOSUPERUSER) + fail2ban + standart-dışı port + düzenli yama.

Kalan gerçek risk (dürüst):
- Port tüm internete açık → sürekli tarama/brute-force + gelecekteki bir **pre-auth
  PG CVE'si internetten sömürülebilir** hale gelir. fail2ban brute-force'u yavaşlatır,
  pre-auth açığı durdurmaz.
- **`rejectUnauthorized:false` = asıl zayıf halka.** Kanal şifreli ama karşı tarafın
  KİM olduğu doğrulanmıyor → yol üstünde MITM yapabilen biri kendi sertifikasını sunar,
  Vercel kabul eder, **parolayı ve veriyi yakalar.** İnternete açık DB'de bu somut tehdit.
  → **verify-full TLS bunu kapatır; kozmetik değil, kritik.**

Daha güvenli alternatifler ( isteğe bağlı, bloker DEĞİL):
- **IP-allowlist:** Vercel dinamik egress yüzünden ÇALIŞMAZ — Inspira'nın açık
  bırakmasının sebebi bu. Ancak **Vercel Secure Compute / dedicated egress (ücretli)**
  sabit IP verir → o zaman allowlist mümkün. En temiz "gerçek" çözüm, ama para/kurulum.
- **Tünel/bastion** (WireGuard/Tailscale ya da Cloudflare Tunnel TCP): portu internetten
  gizler. Daha çok hareketli parça.

**Öneri:** Bu turda Inspira modelini uygula (port açık + app-rolü + scram + fail2ban +
35342) **AMA Inspira'dan bir adım öteye geç: verify-full TLS (Bölüm 4).** Static-egress/
tünel'i "Dalga-2" gibi sonraki sertleştirme adımı olarak deftere yaz.

## 4. SSL CERT PLANI — Let's Encrypt (visio360performance.com)

Domain var → yapılabilir. Adımlar:
1. **DNS:** `db.visio360performance.com` A-kaydı → 185.149.103.48.
2. **Cert:** certbot ile LE sertifikası. **DNS-01** öner (80 portu açmaya gerek yok);
   HTTP-01 da olur ama 80'i geçici açar. Wildcard gerekmez, tek subdomain yeter.
3. **postgresql.conf:** `ssl=on`, `ssl_cert_file=…/fullchain.pem`,
   `ssl_key_file=…/privkey.pem` (owner `postgres`, `chmod 600` key).
4. **Yenileme:** LE 90 gün. `certbot renew` + **deploy-hook: postgres reload (SIGHUP)**
   (yenilenen cert'i PG yeni bağlantılarda kullanır; restart gerekmez).
5. **pg_hba.conf:** `hostssl visio360_prod visio360_app 0.0.0.0/0 scram-sha-256`
   (yalnız SSL, yalnız bu DB+rol).
6. **İstemci — rejectUnauthorized:true'ya geçiş:**
   - `PG_DATABASE_URL=postgresql://visio360_app:***@db.visio360performance.com:35342/visio360_prod?sslmode=verify-full`
   - `db.ts`: `ssl: { rejectUnauthorized: true }` (LE public köke zincirlenir; Node'un
     yerleşik CA deposu doğrular, ek `ca` gerekmez). **Domain ile bağlan** (cert IP'yi
     doğrulamaz) → host artık ham IP değil, `db.visio360performance.com`.
   - `verify-full` = hem zincir hem **hostname** doğrulanır → MITM kapanır.

⚠️ Sıra önemli: önce cert + DNS + PG ssl_cert yerine otursun, SONRA istemcide
`rejectUnauthorized:true`. Ters sırada bağlantı kırılır.

## 5. ÖNERİ (özet)
- Inspira360X modelini **birebir uygula** (port 35342 açık, app-rolü, scram, fail2ban).
- **Inspira'dan bir adım ilerle:** domain + Let's Encrypt + `verify-full`
  (`rejectUnauthorized:true`) — internete açık DB'de asıl kritik sertleştirme bu.
- Static-egress/tünel → sonraki sertleştirme dalgası (bloker değil).
- Kopyalarken Inspira'nın `set_config(...,false)` session-level desenini ALMA;
  Visio360'ın `SET LOCAL` (withActor) deseni doğru.
