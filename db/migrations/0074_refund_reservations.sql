-- Reserve captured value before contacting the acquirer so distinct
-- concurrent refund requests cannot collectively exceed the captured sum.
CREATE TABLE refund_reservations (
    idempotency_key_id UUID PRIMARY KEY REFERENCES idempotency_keys (id),
    transaction_id     UUID NOT NULL REFERENCES transactions (id),
    amount_fils        BIGINT NOT NULL CHECK (amount_fils > 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refund_reservations_transaction
    ON refund_reservations (transaction_id);
