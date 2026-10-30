#!/usr/bin/env -S npx tsx
/**
 * One-off March 2026 reconciliation sweep. Finance wants the scheme
 * rounding residue (the gap between what gets journaled at capture and
 * what the scheme export can actually carry at 2 decimal places) written
 * off for March before the books close on it. A database run key prevents
 * duplicate postings when the script is retried.
 * scripts/out/reconcile-2026-03.log for the last real run's output.
 *
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/reconcile_march.ts
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { formatBhd, toFils } from "@filspay/money";

export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  const monthText = String(month).padStart(2, "0");
  const next = new Date(Date.UTC(year, month, 1));
  const nextText = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return {
    start: new Date(`${year}-${monthText}-01T00:00:00+03:00`),
    end: new Date(`${nextText}T00:00:00+03:00`),
  };
}

export interface ResidueRow {
  merchantId: string;
  capturedFils: number;
}

/** The fils truncated away when a captured amount is quantized down to the
 *  scheme export's 2-decimal-place granularity. */
// MK: % 10 on a non-negative int. correct.
export function computeResidueFils(capturedFils: number): number {
  return capturedFils % 10;
}

interface MerchantResidue {
  merchantId: string;
  lineCount: number;
  residueFils: number;
}

async function fetchResidueRows(client: Client, year: number, month: number): Promise<ResidueRow[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const result = await client.query<{ merchant_id: string; captured_fils: string }>(
    `SELECT t.merchant_id, SUM(te.amount_fils)::text AS captured_fils
       FROM scheme_export_lines sel
       JOIN settlement_batches sb ON sb.id = sel.settlement_batch_id
       JOIN transactions t ON t.id = sel.transaction_id
       JOIN transaction_events te
         ON te.transaction_id = sel.transaction_id
        AND te.settlement_batch_id = sel.settlement_batch_id
        AND te.event_type IN ('captured', 'partially_captured')
      WHERE sb.batch_date >= $1::date AND sb.batch_date < $2::date
      GROUP BY t.merchant_id, sel.settlement_batch_id, sel.transaction_id, sel.amount_fils
     HAVING SUM(te.amount_fils) > sel.amount_fils
      ORDER BY t.merchant_id`,
    [startDate, endDate],
  );
  return result.rows.map((r) => ({ merchantId: r.merchant_id, capturedFils: Number(r.captured_fils) }));
}

/**
 * One correction group per merchant. lineCount is the number of transactions
 * with a non-zero residue, not the number of scheme lines.
 */
function groupByMerchant(rows: ResidueRow[]): MerchantResidue[] {
  const byMerchant = new Map<string, MerchantResidue>();
  for (const row of rows) {
    const residue = computeResidueFils(row.capturedFils);
    const existing = byMerchant.get(row.merchantId);
    if (existing) {
      existing.lineCount += 1;
      existing.residueFils += residue;
    } else {
      byMerchant.set(row.merchantId, { merchantId: row.merchantId, lineCount: 1, residueFils: residue });
    }
  }
  return [...byMerchant.values()];
}

// am: re-running is safe, entry_group_id dedupes it
async function postResidueCorrection(client: Client, merchant: MerchantResidue, now: Date): Promise<void> {
  if (merchant.residueFils <= 0) return;
  const entryGroupId = randomUUID();
  const description = "March 2026 scheme rounding residue sweep — manual recon per finance";
  await client.query(
    `INSERT INTO ledger_entries (entry_group_id, merchant_id, account_id, direction, amount_fils, occurred_at, description)
     VALUES ($1, $2, 'scheme_rounding_residue', 'debit', $3, $4, $5),
            ($1, $2, 'card_scheme_clearing', 'credit', $3, $4, $5)`,
    [entryGroupId, merchant.merchantId, merchant.residueFils, now.toISOString(), description],
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("reconcile_march: DATABASE_URL environment variable is not set");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  // FH: the log says 'run at ...+03:00' but toISOString is always Z?? MK: different node version
  const now = new Date();

  try {
    const rows = await fetchResidueRows(client, 2026, 3);
    const merchantResidues = groupByMerchant(rows);
    const totalResidueFils = merchantResidues.reduce((sum, m) => sum + m.residueFils, 0);

    const { start, end } = monthBounds(2026, 3);
    console.log("=== March 2026 reconciliation sweep ===");
    console.log(`run at: ${now.toISOString()}`);
    console.log(`window: ${start.toISOString().slice(0, 10)} .. ${end.toISOString().slice(0, 10)}`);
    console.log("");

    await client.query("BEGIN");
    try {
      const runClaim = await client.query(
        `INSERT INTO one_off_reconciliation_runs (run_key, detail)
         VALUES ('reconcile_march_2026', 'March 2026 scheme rounding residue')
         ON CONFLICT (run_key) DO NOTHING RETURNING run_key`,
      );
      if (runClaim.rowCount === 0) {
        await client.query("ROLLBACK");
        console.log("This reconciliation has already been applied; no entries were changed.");
        return;
      }
      for (const merchant of merchantResidues) {
        await postResidueCorrection(client, merchant, now);
        console.log(
          `merchant ${merchant.merchantId}: ${merchant.lineCount} line(s), residue ${formatBhd(toFils(merchant.residueFils))} BD (${merchant.residueFils} fils)`,
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    console.log("---");
    console.log(`total lines matched: ${rows.length}`);
    console.log(`total residue swept: ${formatBhd(toFils(totalResidueFils))} BD (${totalResidueFils} fils)`);
    console.log("");
    console.log("reconciliation applied successfully");
  } finally {
    await client.end();
  }
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
