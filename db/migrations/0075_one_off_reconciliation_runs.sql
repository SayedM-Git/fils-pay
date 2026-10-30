-- Durable idempotency keys for finance's one-off reconciliation scripts.
CREATE TABLE one_off_reconciliation_runs (
    run_key    TEXT PRIMARY KEY,
    detail     TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Earlier versions of the March script used this shared description but
-- had no run key. Mark it complete when a prior posting is present.
INSERT INTO one_off_reconciliation_runs (run_key, detail)
SELECT 'reconcile_march_2026', 'March 2026 scheme rounding residue already posted'
 WHERE EXISTS (
   SELECT 1 FROM ledger_entries
    WHERE description LIKE 'March 2026 scheme rounding residue sweep%'
 );
