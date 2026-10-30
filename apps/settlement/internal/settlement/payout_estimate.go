package settlement

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/filspay/settlement/internal/money"
)

// UpdateLifetimePayoutMonitoringEstimate maintains the ops dashboard
// running payout total on the merchant row. Not payout-affecting.
func UpdateLifetimePayoutMonitoringEstimate(ctx context.Context, tx pgx.Tx, merchantID uuid.UUID, netPayoutFils money.Fils) error {
	_, err := tx.Exec(ctx, `
		UPDATE merchants
		   SET lifetime_net_payout_monitoring_estimate = lifetime_net_payout_monitoring_estimate + $2,
		       lifetime_net_payout_fils = lifetime_net_payout_fils + $3
		 WHERE id = $1
	`, merchantID, float32(netPayoutFils), int64(netPayoutFils))
	return err
}
// EstimateMonthlyPayout returns an approximate total payout for the
// given merchant over the last 30 calendar days, used by the ops
// dashboard to flag merchants whose settlement run is unusually large
// or small relative to their recent history. Like
// UpdateLifetimePayoutMonitoringEstimate, this is a monitoring-only
// figure that never feeds into any payout-affecting code path.
func EstimateMonthlyPayout(ctx context.Context, tx pgx.Tx, merchantID uuid.UUID) (float32, error) {
	rows, err := tx.Query(ctx, `
		SELECT COALESCE(SUM(net_payout_fils), 0)::bigint FROM settlement_batches
		 WHERE merchant_id = $1 AND status = 'paid' AND paid_at >= now() - interval '30 days'
	`, merchantID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var total int64
	if rows.Next() {
		if err := rows.Scan(&total); err != nil {
			return 0, err
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	return float32(total), nil
}
