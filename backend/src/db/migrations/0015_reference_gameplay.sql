-- Reference gameplay extends existing Event/Round tables; historical rows stay intact.
ALTER TABLE rounds ADD COLUMN game_code varchar(6);
ALTER TABLE rounds ADD COLUMN creation_key text;
ALTER TABLE rounds ADD COLUMN closing_sequence integer;
CREATE UNIQUE INDEX rounds_game_code_unique ON rounds(game_code) WHERE game_code IS NOT NULL;
CREATE UNIQUE INDEX rounds_creation_key_unique ON rounds(creation_key) WHERE creation_key IS NOT NULL;
ALTER TABLE event_keys ADD COLUMN item_number integer CHECK (item_number BETWEEN 1 AND 90);
CREATE UNIQUE INDEX event_keys_item_number_unique ON event_keys(event_id,item_number) WHERE item_number IS NOT NULL;
ALTER TABLE round_questions ADD COLUMN category varchar(80);
ALTER TABLE round_questions ADD COLUMN code_snippet text;
ALTER TABLE draws ADD COLUMN answer_revealed boolean NOT NULL DEFAULT true;
ALTER TABLE draws ADD COLUMN code_snippet text;
ALTER TABLE draws ADD COLUMN category varchar(80);
ALTER TABLE round_patterns DROP CONSTRAINT chk_round_patterns_type;
ALTER TABLE round_patterns ADD CONSTRAINT chk_round_patterns_type CHECK (pattern_type IN ('EARLY_5','FOUR_CORNERS','TOP_LINE','MIDDLE_LINE','BOTTOM_LINE','FULL_HOUSE','SECOND_FULL_HOUSE'));
