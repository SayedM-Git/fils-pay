-- Claim callback identities transactionally before applying their effects.
-- Existing callback notes are retained as audit evidence and seed the dedupe
-- set so replaying an old callback cannot append another note.
CREATE TABLE processed_acquirer_callbacks (
    callback_id   TEXT NOT NULL,
    callback_type TEXT NOT NULL,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (callback_id, callback_type)
);

INSERT INTO processed_acquirer_callbacks (callback_id, callback_type)
SELECT DISTINCT callback_id, callback_type
  FROM acquirer_callback_notes
ON CONFLICT DO NOTHING;
