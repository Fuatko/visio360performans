# Durum Kontrolü — pg göçü (14 Ağustos, sabah)

> Bu dosya geçici — git'e eklenmez, istediğinde silebilirsin. VS Code Explorer'dan
> tıkla → aç → Cmd+A → Cmd+C ile temiz kopyala.

## 1. Git durumu
- Çalışma ağacı: TEMİZ (uncommitted değişiklik yok)
- Son commit: f16c9424 — canavar (evaluation-evaluator-scope)
- Dünkü commit'ler yerinde: f16c9424 canavar (~64 pg), f112a34c evaluation-duty-questions (16), grup-3/2/1 zincirde.

## 2. Build
BUILD_EXIT=0 (temiz, hata yok)

## 3. Kalan lib/server envanteri (7 dosya, ~35 sorgu)

| Dosya | Sorgu | Sınıf | Client-shared? | Destructive? |
|---|---|---|---|---|
| remove-self-eval-assignments.ts | 4 | oku + DELETE | Hayır (1 route) | EVET (destructive) |
| question-text-resolve.ts | 7 | oku | EVET | Hayır |
| inspirasuite.ts | 9 | oku + insert/update/upsert | Hayır | Hayır (entegrasyon kaydı) |
| evaluator-answer-detail-fetch.ts | 9 | oku | Hayır | Hayır |
| matrix-report-slices.ts | 3 | oku | Hayır | Hayır |
| evaluation-response-scope.ts | 2 | oku | Hayır | Hayır |
| evaluation-evaluator-coverage.ts | 1 | oku | Hayır (tsx import type) | Hayır |
| session.ts | 0 | — | — | DB'siz, atla (tüm .from( = Buffer.from) |

### DESTRUCTIVE (veri siler) — 1 dosya
- remove-self-eval-assignments.ts: evaluation_assignments + evaluation_responses üzerinde .delete() (self-eval temizliği). Tek route importer -> izole.

### CLIENT-SHARED (route ile / refactor) — 1 dosya
- question-text-resolve.ts: admin/results/page.tsx ('use client') resolveQuestionLabel/questionIdsMatch value-import ediyor. @/lib/db eklersem pg client bundle'a girer -> build kırılır. 3 saf helper'ı ayrı client-safe modüle bölmek gerekir. Route fazına.

## 4. Öneri — nereden başlamalı?
1. Isınma (opsiyonel): evaluation-evaluator-coverage.ts (1 sorgu, saf okuma).
2. Asıl hedef: remove-self-eval-assignments.ts (tek destructive, izole). DELETE'in WHERE/IN filtreleri birebir korunmalı (org-scope + period + kişi).
3. question-text-resolve.ts'e DOKUNMA — client-shared, bölme refactor'ı route fazında.
