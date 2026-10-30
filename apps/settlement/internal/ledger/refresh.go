package ledger

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RefreshBalanceCache uses the same authoritative ledger walk as the CLI.
func RefreshBalanceCache(ctx context.Context, db *pgxpool.Pool) (map[uuid.UUID]RebuildDiff, error) {
	return RebuildAllBalances(ctx, db)
}
