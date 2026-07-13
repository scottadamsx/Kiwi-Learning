import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const by_task = db
    .prepare(
      `SELECT task, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd, AVG(ms) AS avg_ms
       FROM usage_log GROUP BY task ORDER BY input_tokens DESC`
    )
    .all();
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS calls, SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd
       FROM usage_log`
    )
    .get();
  return NextResponse.json({ by_task, totals });
}
