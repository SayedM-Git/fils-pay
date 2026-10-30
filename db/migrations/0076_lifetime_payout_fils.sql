-- Preserve lifetime payout monitoring totals as exact integer fils.
ALTER TABLE merchants
  ADD COLUMN lifetime_net_payout_fils BIGINT NOT NULL DEFAULT 0;

UPDATE merchants m
   SET lifetime_net_payout_fils = COALESCE((
     SELECT SUM(sb.net_payout_fils)::bigint
       FROM settlement_batches sb
      WHERE sb.merchant_id = m.id
        AND sb.status = 'paid'
   ), 0);
