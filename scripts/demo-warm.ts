import { DEMO_ZIP, warmDemo, warmRefusal } from "../lib/demo-warm";
import { loadEnv } from "../lib/env";
import { prepareDatabase } from "../lib/local-db";

// npm run demo:warm: runs the Referrals searches the demo shows at ZIP 60614 once and keeps
// their answers in referral_fetch_cache, then puts the nearest few of each kind on the board
// (lib/demo-warm.ts). `npm run demo:warm -- --cache-only` fills the cache and adds nothing.
// Run it after `npm run db:reset`, on the day of the recording (answers are kept a day).
loadEnv();

const { url } = await prepareDatabase();
// warmDemo checks this too; checked here first so nothing is opened on a refusal.
const refusal = warmRefusal(url, process.env.SUPABASE_PROJECT_REF);
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

const cacheOnly = process.argv.includes("--cache-only");
console.log(`Warming the Referrals demo around ${DEMO_ZIP}. This asks each public source once and can take a few minutes.`);
const report = await warmDemo({ url, deps: { addToBoard: !cacheOnly }, log: (line) => console.log(`  ${line}`) });

const miles = (m: number | null) => (m === null ? "no radius answered" : `${m} miles`);
console.log(`\nMap (${miles(report.mapMiles)}): ${report.providers} providers from the NPI Registry (${report.atAddress} placed at their building).`);
console.log(`Places near you (${miles(report.placesMiles)}): ${report.places} places from CMS and OpenStreetMap.`);
console.log("By category:");
for (const c of report.categories) console.log(`  ${c.label.padEnd(44)} ${c.count}`);
if (!cacheOnly) console.log(`Added to the board: ${report.added.nppes} from the NPI Registry, ${report.added.cms} from CMS, ${report.added.osm} from OpenStreetMap.`);
if (report.notKept.length) {
  console.log("\nThese answers couldn't be saved, so the recording would ask again:");
  for (const f of report.notKept) console.log(`  - ${f}`);
}
if (report.failed.length || report.notKept.length) {
  if (report.failed.length) console.log("\nThese didn't answer. Run npm run demo:warm again in a few minutes:");
  for (const f of report.failed) console.log(`  - ${f}`);
  process.exit(2);
}
console.log("\nEvery source answered. Next: npm run demo:check");
process.exit(0);
