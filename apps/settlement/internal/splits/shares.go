package splits

import (
	"math/big"
	"sort"

	"github.com/filspay/settlement/internal/money"
)

// ChildWeight is one sub-merchant's configured share of a parent's payout.
type ChildWeight struct {
	WeightBps int64
}

// ChildShares distributes netPayout across children by their weights.
func ChildShares(netPayout money.Fils, children []ChildWeight) []money.Fils {
	out := make([]money.Fils, len(children))
	remainders := make([]*big.Int, len(children))
	var allocated int64
	for i, c := range children {
		product := new(big.Int).Mul(big.NewInt(int64(netPayout)), big.NewInt(c.WeightBps))
		quotient, remainder := new(big.Int), new(big.Int)
		quotient.QuoRem(product, big.NewInt(10000), remainder)
		out[i] = money.Fils(quotient.Int64())
		remainders[i] = remainder
		allocated += quotient.Int64()
	}
	leftover := int64(netPayout) - allocated
	order := make([]int, len(children))
	for i := range order { order[i] = i }
	sort.SliceStable(order, func(i, j int) bool {
		return remainders[order[i]].Cmp(remainders[order[j]]) > 0
	})
	for i := int64(0); i < leftover && i < int64(len(order)); i++ {
		out[order[i]]++
	}
	return out
}
