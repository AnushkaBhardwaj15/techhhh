ALTER TABLE draws ADD COLUMN reveal_batch_id uuid;

-- Reveal audit entries in one transaction share a timestamp, preserving older batches.
WITH batches AS MATERIALIZED (
  SELECT resource_id, created_at, gen_random_uuid() AS batch_id
  FROM audit_logs
  WHERE action = 'ANSWER_REVEALED' AND metadata ? 'sequence'
  GROUP BY resource_id, created_at
)
UPDATE draws d SET reveal_batch_id = b.batch_id
FROM audit_logs a JOIN batches b ON b.resource_id = a.resource_id AND b.created_at = a.created_at
WHERE a.action = 'ANSWER_REVEALED'
  AND a.resource_id = d.round_id::text
  AND a.metadata->>'sequence' = d.sequence_number::text
  AND d.answer_revealed;
