# ROUTE FAZI — TEMİZ ENVANTER (Array/Buffer.from temizlenmiş gerçek sayılar)

## 1. GERÇEK RAKAMLAR
- Toplam route.ts: **82**
- Gerçek supabase sorgusu (Array.from/Buffer.from HARİÇ): **450**
  (ham .from(=509; Array.from=59 → gerçek 450. "392" tahmini düşükmüş.)
- **0 gerçek sorgu (no-op, dokunma): 14 route**
- Kısmî çevrilmiş (pg VAR + hâlâ ham supabase): **4 route** (33 kalan sorgu)
- Hiç başlanmamış (yalnız supabase): **64 route**

### 14 NO-OP route (atla):
insights, insights-ai, matrix-karne, ops-health, platform-settings,
repair-period-category-scopes, results/ai-explain, security-health,
cron/training-sync, health/ai, health/security,
integrations/inspirasuite/{assign,courses,progress}

## 2. DOMAIN GRUPLARI (route / gerçek-sorgu / destructive-op)
  dashboard                     5 / 53 / 6
  evaluation                    2 / 39 / 9   (submit destructive-ağır)
  admin/surveys                 3 / 24 / 6
  admin/results                 2 / 23 / 0   (⚠ question-text-resolve'e bağımlı)
  admin/assignments             4 / 20 / 10  (clear-period/reopen destructive)
  admin/coefficients            1 / 19 / 8   (KISMÎ: withActor)
  admin/action-plans            4 / 17 / 5
  admin/questions               1 / 17 / 9   (import destructive-ağır)
  admin/survey-assignments      1 / 15 / 7
  admin/period-evaluator-scope  1 / 14 / 0
  admin/period-duty-questions   1 / 13 / 6
  cron                          2 / 11 / 3
  admin/period-content-snapshot 1 / 10 / 5
  admin/period-reports-snapshot 1 / 10 / 2
  survey                        2 / 10 / 3
  ... (kalan ~20 grup, çoğu 1-9 sorgu, salt-okuma raporlar)

## 3. RİSK SINIFLANDIRMASI
- CLIENT-SHARED bağımlı (question-text-resolve çağırır) — 2 route:
    admin/results, admin/evaluator-answer-detail
    → bu libin bölme-refactor'undan SONRA tamamlanmalı (yoksa split-brain)
- DESTRUCTIVE (del/upd/ins/ups) — 35 route. En ağır 6:
    admin/questions/import(9), evaluation/submit(9), admin/coefficients(8),
    admin/survey-assignments(7), admin/period-duty-questions(6), dashboard/action-plans(6)
- AUTH/LOGIN/USERS (EN SON) — 4 route:
    send-otp, session, session/brand, admin/users

## 4. ⚠️ KRİTİK KARAR: HANGİ PATTERN?
lib/server'da: isPgEnabled() + pgQuery (RLS YOK, açık org filtresi, env yok→supabase).
Route'larda (coefficients/periods/organizations/orgs zaten): **withActor / secure-query**
  = RLS org-context kuran güvenli sorgu (org izolasyonu DB seviyesinde).
→ Route fazına başlamadan seçilmeli:
   (A) withActor pattern'ini yaygınlaştır (routes = izolasyon sınırı; RLS daha güvenli)
   (B) lib'deki gibi isPgEnabled fallback (tutarlı ama RLS yok, açık filtreye güvenir)
   (C) hibrit: okuma=isPgEnabled fallback, yazma/destructive=withActor
Öneri: routes org-izolasyonun kalbi olduğu için (A) veya (C).

## 5. ÖNERİLEN SIRA (en izole → en riskli)
R1 warm-up: 19 "en güvenli" route (≤3 sorgu, destr=0, auth değil, client-shared değil)
    örn: matrix-structure-report(1), matrix-person-results-report(1),
    person-question-peer-averages(1), coverage(2), participation(2),
    matrix-scope-report(3), no-opinion-report(3), sync-evaluator-duty-matrices(2)
R2: 4 KISMÎ route'u bitir (coefficients/periods/organizations/orgs) — pattern zaten withActor
R3: orta salt-okuma raporlar (compensation, matrix-data, dashboard, person-report-card, i18n-debug)
R4: dashboard/* + evaluation/* (ağır + destructive)
R5: admin yazma-ağır (assignments, questions, surveys, period-*, action-plans, snapshots)
R6: DESTRUCTIVE-kritik (clear-period, period-duty-clear, reopen)
R7: question-text-resolve BÖL (client-shared) → results + evaluator-answer-detail'i aç
R8 (EN SON): auth (send-otp, session, session/brand, admin/users)
