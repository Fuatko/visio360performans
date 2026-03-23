-- Tamamlanmış ama hiç evaluation_responses satırı olmayan atamaları manuel inceleme için listeler.
-- Uygulama: Admin → Değerlendirme Matrisi → "Yanıtsız tamamlananları yeniden aç" düğmesi tercih edilir.

-- Örnek: belirli dönem (period_id yerine kendi UUID'nizi yazın)
/*
SELECT ea.id, ea.evaluator_id, ea.target_id, ea.status, ea.completed_at
FROM evaluation_assignments ea
LEFT JOIN evaluation_responses er ON er.assignment_id = ea.id
WHERE ea.period_id = 'PERIOD_UUID_HERE'
  AND ea.status = 'completed'
GROUP BY ea.id, ea.evaluator_id, ea.target_id, ea.status, ea.completed_at
HAVING COUNT(er.id) = 0;
*/
