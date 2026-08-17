# faz0-RLS — SEÇENEK C (KADEMELİ FORCE) FİNAL: Kapsam + Politika + Kanıt (uygulama YOK)

> Geçici dosya (git'e girmez). SQL taslağı: `sql/faz0-rls-org-isolation.sql`.
> PG17 kurulup veri restore edilince UYGULANACAK. Şu an sadece final taslak + açıklama.

## ÖZET — Seçenek C'nin gerçek sonucu (doğrulama sonrası)

Her tablonun okuma yolu koddan tarandı (alt-ajan, file:line kanıtlı). İki yapısal
gerçek: **(1)** FORCE'lu tabloyu context-less okursan 0 satır (karadelik); **(2)**
visio360_app tablo SAHİBİ → "enable ama force değil" = sahip bypass (dormant).

- **FORCE alan (DB-seviyesi AKTİF) — 5 tablo:** hiçbir yerde context-less erişilmeyenler:
  `training_completions`, `security_audit_logs`, `otp_codes`, `backup_runs`,
  `user_accessibility_preferences`.
- **DORMANT (enable+policy, force YOK) — 43 tablo:** bir yerde pgRead/query/pgRes ile
  okunuyor → FORCE karadelik yapardı. İzolasyon JS'te (açık WHERE). Okuma withActor'a
  taşınınca tek satır FORCE.

> 🔧 **DÜZELTME (SECURITY DEFINER tuzağı):** `otp_rate_limits` / `otp_verify_attempts`
> ilk taramada "pg erişimi yok" görünüp FORCE listesindeydi. Gerçekte SADECE
> `check_otp_rate_limit` / `check_otp_verify_rate_limit` (**SECURITY DEFINER**)
> fonksiyonlarından, `pgQuery` ile **context-less** erişiliyor (send-otp:177, session:101).
> Restore sonrası fonksiyon sahibi visio360_app (NOBYPASSRLS) → FORCE olsaydı fonksiyon
> içi insert/select politikaya takılır, **OTP rate-limit kırılırdı**. Bu yüzden ikisi
> **DORMANT** (sahip-bypass ile fonksiyon serbest). Doğrulama ajanı bunu kaçırmıştı
> (erişim fonksiyon gövdesinde, route SQL'inde değil) → düzeltildi.

> ⚠️ **DÜRÜST DÜZELTME — beklentiye aykırı:** "En yıkıcı işlemler withActor ile
> erişiliyor → FORCE güvenli, DB'de korunur" **doğru değil**. `evaluation_responses`,
> `evaluation_assignments`, `evaluation_period_*` YAZILIRKEN withActor kullanıyor AMA
> raporlarda **context-less OKUNUYOR** → FORCE alamıyorlar → sahip bypass → withActor
> yazmaları da DB'de zorlanmıyor. Yani **submit/clear-period/reopen'ın DB-seviyesi
> ikinci katmanı bu fazda YOK; koruma JS'te.** DB'ye almak için: bu tabloların OKUMA
> yollarını önce withActor'a taşı, sonra FORCE ("FORCE Dalgası-2", SQL Bölüm 6).

## 0. ÖNCE OKU — uygulamadan önceki TEK kritik karar (pgRead vs FORCE RLS)

Havuz **tek rol** kullanıyor: `visio360_app` (superuser değil, BYPASSRLS değil).
İki okuma/yazma yolu var, ikisi de aynı role bağlanıyor:

| Yol | Nasıl çalışır | RLS bağlamı (`app.current_*`) |
|---|---|---|
| `withActor()` (secure-query.ts) | `begin; SET LOCAL app.current_role/org/user_id` | **DOLU** — politika org_admin'i kilitler |
| `pgRead/pgReadOne` (lib/db `query()`) | düz `pool.query()`, tx yok | **AYARSIZ** — `current_setting`=NULL |

**Sonuç:** FORCE RLS açık bir tabloyu `pgRead` ile okursan politika
`(app_is_super() OR org=app_org())` = `(false OR false)` = **FALSE → 0 satır**.
Bu koruma değil, **karadelik**. Somut örnek: public anket GET'i `surveys`'i
`pgReadOne` ile okuyor → `surveys`'te FORCE RLS varsa **anket yükleme kırılır**.

Yani politikalar (aşağıdaki tablo) doğru; ama **hangi tablolarda FORCE'u
şimdi açacağımız**, o tablonun okuma yolunun withActor'a taşınıp taşınmadığına bağlı.
→ **Senin kararın** (Bölüm 4).

## 1. KAPSAM DENETİMİ — 46 tablo, sınıflara ayrıldı

Sınıf → politika eşlemesi (SQL'de karşılığı parantezde):

| # | Tablo | org'a nasıl bağlı | Sınıf / Politika |
|---|---|---|---|
| 1 | organizations | **id** (kolon organization_id değil) | ÖZEL `org_self` (id=org) |
| 2 | users | organization_id | A direkt (`org_isolation`) |
| 3 | evaluation_periods | organization_id | A direkt |
| 4 | action_plans | organization_id | A direkt |
| 5 | evaluation_duties | organization_id (+period) | A direkt |
| 6 | evaluation_invitations | organization_id | A direkt |
| 7 | evaluation_period_scoring_settings | organization_id (+period) | A direkt |
| 8 | evaluation_period_user_report_snapshots | organization_id (+period) | A direkt (B'de de var, zararsız) |
| 9 | integration_logs | organization_id | A direkt |
| 10 | international_standards | organization_id | A direkt |
| 11 | surveys | organization_id (**NULLABLE**) | A direkt (null-org → yalnız super) |
| 12 | training_assignments | organization_id | A direkt |
| 13 | training_catalog | organization_id | A direkt |
| 14 | confidence_settings | organization_id | A direkt |
| 15 | deviation_settings | organization_id | A direkt |
| 16 | evaluation_assignments | period_id | **B** join-period (`app_period_in_org`) |
| 17 | evaluation_period_questions | period_id | B join-period |
| 18 | evaluation_period_category_weights | period_id | B join-period |
| 19 | evaluation_period_evaluator_weights | period_id | B join-period |
| 20 | evaluation_period_duty_categories | period_id | B join-period |
| 21 | evaluation_period_duty_questions | period_id | B join-period |
| 22 | evaluation_period_evaluator_categories | period_id | B join-period |
| 23 | evaluation_period_evaluator_scope | period_id | B join-period |
| 24 | evaluation_period_evaluator_target_categories | period_id | B join-period |
| 25 | evaluation_period_evaluator_target_scope | period_id | B join-period |
| 26 | evaluation_period_user_duties | period_id | B join-period |
| 27 | evaluation_period_main_categories_snapshot | period_id | B join-period |
| 28 | evaluation_period_categories_snapshot | period_id | B join-period |
| 29 | evaluation_period_questions_snapshot | period_id | B join-period |
| 30 | evaluation_period_answers_snapshot | period_id | B join-period |
| 31 | **evaluation_responses** | assignment_id→period→org | **C** join-2hop (`app_assignment_in_org`) |
| 32 | international_standard_scores | assignment_id→period→org | C join-2hop |
| 33 | survey_questions | survey_id→org | D survey-1hop (`app_survey_in_org`) |
| 34 | survey_assignments | survey_id→org | D survey-1hop |
| 35 | survey_ai_analyses | survey_id→org | D survey-1hop |
| 36 | survey_responses | survey_id→org | D survey-1hop (+anon insert, aşağı) |
| 37 | survey_answers | response_id→response→survey→org | D survey-2hop (`app_response_in_org`) |
| 38 | survey_assignment_categories | assignment_id→survey_assign→org | D survey-2hop |
| 39 | survey_assignment_questions | assignment_id→survey_assign→org | D survey-2hop |
| 40 | action_plan_tasks | plan_id→action_plans.org | tekil join (`app_plan_in_org`) |
| 41 | user_accessibility_preferences | user_id→users.org | tekil join (`app_user_in_org`) |
| 42 | platform_settings | — (global) | **G** system_only (super) |
| 43 | integration_settings | — (platform-global) | G system_only |
| 44 | backup_runs | — (ops) | G system_only |
| 45 | otp_rate_limits | — (global) | G system_only |
| 46 | otp_verify_attempts | — (global) | G system_only |
| — | security_audit_logs | — (global) | G system_only |
| — | training_completions | user_email (gevşek, org'lar-arası) | G system_only (org-kırılımı app'te) |
| — | **otp_codes** | — | ⚠️ sql/*'ta CREATE yok (erken şema). Restore'da VARSA G'ye ekle |
| — | _sj_import_tr_fr | — | import-scratch; RLS gereksiz (drop edilebilir) |

**Kapsam tam mı?** Evet — 46 CREATE'in hepsi sınıflandı. İki uyarı:
`otp_codes` (bu repoda CREATE edilmemiş; restore sonrası kontrol) ve
`_sj_import_tr_fr` (geçici import tablosu).

## 2. POLİTİKA TASARIMI (özet)

- **Yardımcı fonksiyonlar** (`app_is_super`, `app_org`, `app_*_in_org`) →
  ~40 politika tek satıra iner, DRY. STABLE + SECURITY INVOKER (definer değil:
  ebeveyn tablonun RLS'i ek savunma).
- **super_admin bypass:** her politikada `app_is_super() OR ...`. Sistem/anonim
  işlemler (login send-otp, anket POST) super_admin sistem aktörüyle koşar → bypass.
- **FORCE RLS:** tablo sahibi bile tabi. visio360_app NOSUPERUSER + NOBYPASSRLS
  (Bölüm 0 ön-koşul denetimi bunu raise ile garanti eder).
- **USING + WITH CHECK ikisi de** her politikada (okuma VE yazma kapsanır).
- **B/C/D join:** child satırın period/assignment/survey'i current_org'a ait mi?
  `EXISTS` alt-sorgusu + org kontrolü. İndeksler mevcut (period_id, assignment_id,
  survey_id, response_id) → EXISTS ucuz.

## 3. SURVEY ÖZEL — "anonim public insert nasıl RLS'lenir?"

**Seçenek A (mevcut kodla birebir — SQL bunu varsayar):**
`survey/[slug]` POST'u `SYSTEM_ACTOR{role:'super_admin', orgId:null}` ile
`withActor` açıyor → `app_is_super()=TRUE` → `WITH CHECK (super OR ...)` = TRUE →
insert geçer. **Ayrı public-insert policy GEREKMEZ.**

Neden güvenli (yapısal): `survey_id` slug'dan sunucuda çözülür,
`respondent_user_id`/`source`/`meta` sunucu-set; katılımcı org-belirleyici alan
enjekte edemez; W1(response)+W2(answers) **tek atomik tx** (yarım-yanıt imkânsız).
org_admin bu tabloları yalnız OKUR (analytics) ve join ile kendi org'una kilitlenir.

Alternatif (istenirse, savunma-derinliği): survey POST'u super_admin yerine
düşük-yetkili aktörle koşup `survey_responses`/`answers`'a dar bir
"anket açıksa insert" WITH CHECK politikası yazmak. Daha karmaşık; şu an gereksiz.
Öneri: **Seçenek A'da kal.**

## 4. GÜVENLİK KANITI

**İddia:** org_admin (org=A) başka org'un (B) verisini — join tablolarda bile —
ne okur ne yazar.

- **Direkt (A sınıfı):** `organization_id::text = app_org()`. A'nın bağlamında
  `app_org()='A'`. B satırı: `'B'='A'` → false → USING gizler; WITH CHECK B yazımını reddeder. ∎
- **Join-period (B):** `app_period_in_org(period_id)` = `super OR EXISTS(period ep
  where ep.id=period_id AND ep.org='A')`. Satırın period'u B'ye aitse EXISTS boş →
  false → gizli/red. Ayrıca `evaluation_periods` de A sınıfı RLS altında →
  alt-sorgu zaten B period'unu göremez (çift kilit). ∎
- **Join-2hop (C, evaluation_responses):** `app_assignment_in_org(assignment_id)`
  assignment→period→org zincirini A'ya kontrol eder. B'nin assignment'ı → false. ∎
- **Survey (D):** `app_survey_in_org / app_response_in_org` surveys.org='A' arar.
  B anketi/yanıtı → false. (surveys.org NULL → yalnız super.) ∎
- **super_admin bypass:** yalnız `app.current_role='super_admin'` iken; bunu SET
  eden tek yer withActor + sistem aktörü. org_admin bu role'ü set edemez
  (session'dan gelir, buildActor super_admin'i yalnız gerçek super session'da verir). ∎

Yukarıdaki ispat, ilgili tablo **FORCE altındayken** geçerlidir. Seçenek C'de
FORCE alan 7 tabloda AKTİF. DORMANT 41 tabloda politika var ama sahip bypass →
ispat DB'de değil, JS katmanında karşılığını bulur (aynı org kontrolü açık WHERE ile).

**DESTRUCTIVE ikinci katman gerçekten devrede mi? — HAYIR (bu fazda).**
`clear-period`, `submit`, `reopen`, `remove-self-eval` → `evaluation_responses` /
`evaluation_assignments` üzerinde DELETE/UPDATE. Bu tablolar raporlarda **context-less
okunuyor** → FORCE ALAMIYOR → sahip bypass → withActor DELETE'i de DB'de zorlanmıyor.
Yani ikinci katman DB'de KAPALI; koruma **yalnız JS'te** (route'un açık WHERE org+period
filtresi). DB'ye almak → "FORCE Dalgası-2" (aşağıda).

## 5. FORCE DURUMU (Seçenek C — item 1/2/3/4 cevabı)

**FORCE VAR (DB-seviyesi AKTİF) — 5 tablo** (okuma yolu context-full ya da pg-erişimi yok):
| tablo | okuma yolu | izolasyon |
|---|---|---|
| training_completions | yalnız withActor{super} (webhook) | DB (system_only) |
| security_audit_logs | yalnız withActor{super} (send-otp/session) | DB (system_only) |
| otp_codes | yalnız withActor{super} (login) | DB (system_only) |
| backup_runs | pg erişimi yok | DB (system_only) |
| user_accessibility_preferences | pg erişimi yok | DB (join user→org) |

**FORCE YOK / DORMANT — 43 tablo** (otp_rate_limits + otp_verify_attempts SECURITY DEFINER
sebebiyle buraya taşındı; kalan 41 context-less okuma sebebiyle) (en az bir context-less okuma; kanıt Böl.1 evidence):
politika var, force yok, izolasyon **JS'te**. Kapsam grupları:
- Sınıf A direkt (surveys, users, organizations, evaluation_periods, action_plans,
  evaluation_duties/invitations, integration_logs, international_standards,
  training_catalog/assignments, confidence/deviation_settings, scoring_settings, ...)
- Sınıf B period-join (evaluation_assignments + tüm evaluation_period_* + snapshotlar)
- Sınıf C 2-hop (evaluation_responses, international_standard_scores)
- Sınıf D survey (survey_questions/assignments/ai_analyses/responses/answers/assignment_*)
- action_plan_tasks; platform_settings, integration_settings (global ama context-less okunuyor)

**item 3 — survey:** `surveys` pgReadOne ile okunuyor (public anket GET) → FORCE YOK ✓.
`survey_responses/answers` **yazma** withActor ✓ ama **okuma** context-less (ai-analyze /
analytics route) → FORCE YOK. Anon insert super sistem aktörü bypass'ıyla zaten çalışır.

## 6. SIRADAKİ — "FORCE Dalgası-2" (destructive'i DB'ye almak için)

Önce şu tabloların TÜM context-less okuyucularını withActor'a taşı, sonra tek satır FORCE:
`evaluation_responses`, `evaluation_assignments` (+ okundukça evaluation_period_*/snapshot).
Taşınacak okuyucular (kanıt Böl.1): fetch-evaluation-responses.ts, matrix-*-build.ts,
dashboard/results, no-opinion-report, evaluator-answer-detail-fetch, period-* raporlar.
Her tablo: okuma %100 withActor → smoke test (pgRead=0 satır, withActor=satır) → FORCE.
- **(B) Plan B rolü:** pgRead'e ayrı `visio360_reader` BYPASSRLS rolü ver (SQL
  Bölüm 9). Okumalar RLS'siz (açık WHERE'e güvenir), yazmalar RLS'li. Tam-izolasyon
  hedefinden taviz.

**Önerim: (C) kademeli**, hedef (A). Böylece anket/dashboard okumaları kırılmaz,
destructive+yazma yolunda DB-seviyesi izolasyon HEMEN devreye girer.
