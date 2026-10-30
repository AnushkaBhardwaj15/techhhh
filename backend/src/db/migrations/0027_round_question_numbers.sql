ALTER TABLE round_questions ADD COLUMN IF NOT EXISTS item_number integer CHECK (item_number BETWEEN 1 AND 90);
UPDATE round_questions q SET item_number=k.item_number FROM event_keys k WHERE q.key_id=k.id AND q.item_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS round_questions_item_number_unique ON round_questions(round_id,item_number) WHERE item_number IS NOT NULL;
