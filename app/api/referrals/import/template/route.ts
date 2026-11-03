import { CSV_TEMPLATE } from "@/lib/referrals/manual";

// The CSV template: the column names and two fictional [Sample] rows.
export async function GET() {
  return new Response(CSV_TEMPLATE, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="referral-sources-template.csv"' },
  });
}
