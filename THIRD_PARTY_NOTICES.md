# Third-party notices

Practice-OS is licensed under the GNU Affero General Public License v3.0 ([LICENSE](LICENSE)), copyright (C) 2026 Isaiah Tennell. That license covers the code Isaiah wrote (with AI coding agents, see section 6). It does not cover the things listed below, which other people made. Each keeps its own license or terms.

This file was checked on 2026-11-04 against the repo files, `node_modules/<package>/package.json`, `package-lock.json`, and the public license pages linked below. Anything that could not be checked from a file or an official page is marked **[UNCONFIRMED]**.

## Open issues (read first)

These need a decision or a fix. Items marked **Resolved** were fixed on 2026-11-04 and stay listed so the history is clear.

1. **Resolved 2026-11-04: the six former React Bits files were rewritten from scratch.** `components/agent-blob/blob-canvas.tsx`, `components/shared/prompt-bar.tsx`, `components/shared/spring-check.tsx`, `components/shared/status-mark.tsx`, `components/shared/thought-line.tsx` and `components/shared/voice-pill.tsx` had been adapted from React Bits, whose license is MIT plus the Commons Clause (no redistribution "as a ported version"), which conflicts with the AGPL. They were rewritten as original Practice-OS code on 2026-11-04, clean room: the old file bodies and the React Bits source were not opened; the rewrite worked only from the exported names and props, the call sites, the tests and the project's own design notes. They keep the same names and props and are now covered by the AGPL like the rest of the app. Still open: `components/shared/liquid-ether.tsx` says it takes only the idea of React Bits Liquid Ether and is "a fresh, smaller version written for Practice-OS"; whether any React Bits code is in it is **[UNCONFIRMED]** (no side-by-side comparison was done).
2. **`@meta-sam/parser` (runtime dependency) uses Meta's custom SAM License**, not an open-source license. It adds use restrictions (trade controls, no ITAR or military use, no reverse engineering) and requires a copy of the license with any redistribution. The AGPL does not allow added restrictions on a combined work. Practice-OS does not ship this package (npm downloads it on install), so the repo itself is fine, but anyone who distributes a bundled build is distributing SAM Materials under Meta's terms. Options: keep it as a separately installed dependency (current state) and say so, or replace it with own parsing code.
3. **Resolved 2026-11-04: Illinois license data (ODbL) is attributed by name.** `lib/referrals/sources/state-license.ts` reads IDFPR's "Professional Licensing" open data (data.illinois.gov `pzzh-kp68`, Open Database License, attribution "IDFPR"). The sources line in the app (`components/referrals/evidence-box.tsx`) now says "Illinois Department of Financial and Professional Regulation (IDFPR), via data.illinois.gov, ODbL 1.0".
4. **OpenStreetMap (ODbL 1.0) attribution is in place;** share-alike is not triggered today. The app shows "© OpenStreetMap contributors (ODbL)" with a link to openstreetmap.org/copyright wherever OSM data shows (`lib/referrals/evidence/merge.ts`, `components/referrals/evidence-box.tsx`, `components/referrals/place-finder.tsx`), Aeon is told to include it in chat (`lib/aeon/tools-referrals.ts`), and the MapLibre map shows the tile attribution automatically. Facts from OSM are saved in each clinician's own database. If a Practice-OS operator ever publishes a database built from those facts, ODbL share-alike applies to that database.
5. **Resolved 2026-11-04: Cal.com screenshots removed.** The 22 screenshots in `docs/research/calcom-ui-study/` (Cal.com's work) were deleted from the repo. The written notes (`docs/research/calcom-ui-study.md`, `docs/research/aeon-calcom-design-mapping.md`) are our own words and stay; they still name the old image files, as labels only. The images remain in the repository's past commits.
6. **Resolved 2026-11-04: own app icon.** `app/favicon.ico` was the Next.js starter's "N" logo (a Vercel trademark). It and the new `app/icon.png` are now Aeon's orb, drawn in code by `scripts/make-icon.ts` (a radial gradient #ffffff, #E3D9FF, #8E7CF8, #4E69DA rendered with sharp).
7. **Meta model terms.** The four Muse models are called through Meta's hosted API; nothing from them is distributed. Use is governed by Meta's API and developer terms, which were not read for this file **[UNCONFIRMED]**: who owns generated images and text, and any limits on health-related use, should be checked before a public release.
8. **Nothing found that is non-commercial, "no derivatives", SSPL, or unlicensed** in the dependency tree: every one of the 764 entries in `package-lock.json` declares a license. coss ui (AGPL), React Bits and React Bits Pro: **no code found** (see section 2; `liquid-ether.tsx` is the one unconfirmed case).

## 1. Software dependencies

Versions and licenses below are read from each package's own `package.json` in `node_modules` (installed versions match `package.json` exactly). None of these packages is copied into the repo; `npm install` downloads them.

#### Runtime (`dependencies`)

| Package | Version | License | Repository |
|---|---|---|---|
| @base-ui/react | 1.9.0 | MIT | https://github.com/mui/base-ui |
| @fontsource/inter | 5.2.8 | OFL-1.1 | https://github.com/fontsource/font-files |
| @huggingface/transformers | 4.3.1 | Apache-2.0 | https://github.com/huggingface/transformers.js |
| @meta-sam/parser | 0.0.13 | SEE LICENSE IN LICENSE | https://github.com/meta-models/meta-sam |
| @modelcontextprotocol/sdk | 1.32.2 | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| clsx | 2.1.1 | MIT | https://github.com/lukeed/clsx |
| date-fns | 4.4.0 | MIT | https://github.com/date-fns/date-fns |
| dotenv | 18.0.9 | BSD-2-Clause | https://github.com/motdotla/dotenv |
| embedded-postgres | 18.4.0-beta.17 | MIT | https://github.com/leinelissen/embedded-postgres |
| lucide-react | 1.61.0 | ISC | https://github.com/lucide-icons/lucide |
| mammoth | 1.12.3 | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js |
| maplibre-gl | 6.14.0 | BSD-3-Clause | https://github.com/maplibre/maplibre-gl-js |
| mediabunny | 1.61.5 | MPL-2.0 | https://github.com/Vanilagy/mediabunny |
| motion | 12.43.0 | MIT | https://github.com/motiondivision/motion |
| next | 16.4.3 | MIT | https://github.com/vercel/next.js |
| openai | 4.104.0 | Apache-2.0 | https://github.com/openai/openai-node |
| opentype.js | 1.3.4 | MIT | https://github.com/opentypejs/opentype.js |
| pdf-lib | 1.17.1 | MIT | https://github.com/Hopding/pdf-lib |
| postgres | 3.4.9 | Unlicense | https://github.com/porsager/postgres |
| react | 19.3.0 | MIT | https://github.com/react/react |
| react-day-picker | 10.0.2 | MIT | https://github.com/gpbl/react-day-picker |
| react-dom | 19.3.0 | MIT | https://github.com/react/react |
| sharp | 0.35.5 | Apache-2.0 | https://github.com/lovell/sharp |
| sonner | 2.0.8 | MIT | https://github.com/emilkowalski/sonner |
| tailwind-merge | 3.7.0 | MIT | https://github.com/dcastil/tailwind-merge |
| three | 0.180.0 | MIT | https://github.com/mrdoob/three.js |
| unpdf | 1.8.1 | MIT | https://github.com/unjs/unpdf |
| zod | 3.25.76 | MIT | https://github.com/colinhacks/zod |
| zod-to-json-schema | 3.25.2 | ISC | https://github.com/StefanTerdell/zod-to-json-schema |

#### Build and test only (`devDependencies`)

| Package | Version | License | Repository |
|---|---|---|---|
| @axe-core/playwright | 4.14.0 | MPL-2.0 | https://github.com/dequelabs/axe-core-npm |
| @playwright/test | 1.64.1 | Apache-2.0 | https://github.com/microsoft/playwright |
| @tailwindcss/turbopack | 4.3.3 | MIT | https://github.com/tailwindlabs/tailwindcss |
| @types/node | 20.19.43 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/opentype.js | 1.3.10 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/three | 0.180.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| eslint | 9.39.5 | MIT | https://github.com/eslint/eslint |
| eslint-config-next | 16.4.3 | MIT | https://github.com/vercel/next.js |
| mupdf | 1.28.1 | AGPL-3.0-or-later | https://cgit.ghostscript.com/mupdf.git/ |
| tailwindcss | 4.3.3 | MIT | https://github.com/tailwindlabs/tailwindcss |
| tsx | 4.23.15 | MIT | https://github.com/privatenumber/tsx |
| typescript | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| vitest | 4.1.12 | MIT | https://github.com/vitest-dev/vitest |

#### Connect relay (`relay/package.json`)

A separate small Vercel project. Its licenses were read from the npm registry (`npm view`) for `@vercel/blob` and from the root install for `sharp`.

| Package | Version | License | Repository |
|---|---|---|---|
| @vercel/blob | 2.8.2 | Apache-2.0 | https://github.com/vercel/storage |
| sharp | 0.35.5 | Apache-2.0 | https://github.com/lovell/sharp |

#### Notes on specific dependencies

- `@meta-sam/parser`: Meta's SAM License (custom, use restrictions). See Open issue 2.
- `mupdf` (dev only, used in tests and scripts): AGPL-3.0-or-later. Compatible with this project's AGPL-3.0.
- `mediabunny` (runtime, browser video export) and `@axe-core/playwright` (dev): MPL-2.0, file-level copyleft. Compatible; changes to their own files would have to stay MPL.
- `sharp` ships prebuilt libvips binaries (`@img/sharp-libvips-*`) under LGPL-3.0-or-later. They are installed as separate packages and loaded dynamically, which LGPL allows.
- `embedded-postgres` (MIT wrapper) downloads platform packages (`@embedded-postgres/<platform>`, MIT) that contain PostgreSQL server binaries. PostgreSQL itself is under the PostgreSQL License (permissive) **[UNCONFIRMED: no PostgreSQL license file found inside the platform package]**.
- `jszip` (transitive) is offered as MIT or GPL-3.0-or-later; MIT is used.
- `caniuse-lite` (transitive, via Next.js) is CC-BY-4.0 data.
- `next/font/google` downloads Inter from Google Fonts at build time (section 5).

### Transitive licenses (summary)

Counted from `package-lock.json` (lockfileVersion 3), which lists 764 packages including optional per-platform builds that are never all installed at once. 324 of them are needed at runtime, the rest only for building and testing.

| License | All packages | Runtime only |
|---|---|---|
| MIT | 592 | 225 |
| Apache-2.0 | 44 | 24 |
| ISC | 36 | 22 |
| MPL-2.0 | 27 | 1 |
| BSD-3-Clause | 20 | 18 |
| BSD-2-Clause | 16 | 9 |
| LGPL-3.0-or-later (sharp's libvips builds) | 10 | 10 |
| Apache-2.0 AND LGPL-3.0-or-later (sharp builds) | 4 | 4 |
| 0BSD | 2 | 2 |
| OFL-1.1 | 1 | 1 |
| (MIT OR Apache-2.0) | 1 | 1 |
| SEE LICENSE IN LICENSE (`@meta-sam/parser`, SAM License) | 1 | 1 |
| BlueOak-1.0.0 | 1 | 0 |
| Python-2.0 (`argparse`) | 1 | 0 |
| CC-BY-4.0 (`caniuse-lite`) | 1 | 1 |
| BSD (`duck`) | 1 | 1 |
| (MIT OR GPL-3.0-or-later) (`jszip`) | 1 | 1 |
| CC0-1.0 | 1 | 0 |
| AGPL-3.0-or-later (`mupdf`) | 1 | 0 |
| (MIT AND Zlib) (`pako`) | 1 | 1 |
| Unlicense (`postgres`) | 1 | 1 |
| (MIT OR CC0-1.0) | 1 | 1 |
| No license declared | 0 | 0 |

## 2. Code copied or adapted into the repo

Found by searching the repo for "adapted from", "based on", "copied", "cookbook", "shadcn", "React Bits", "coss" and license headers.

| File(s) | Origin | License | Notes |
|---|---|---|---|
| `components/shared/liquid-ether.tsx` | Idea from React Bits Liquid Ether; the file says its shader is new code | Own code, idea only **[UNCONFIRMED]** | Not compared line by line. |
| `components/mode-picker.tsx` | Placed where React Bits' Prompt Bar keeps its model picker | Own code | Position only. |
| `components/shared/avatar.tsx`, `calendar.tsx`, `confirm-dialog.tsx`, `settings-controls.tsx`, `slider.tsx`, `attachment.tsx`, `toaster.tsx`; `components.json` | shadcn/ui component patterns (on Base UI, react-day-picker and sonner) | MIT, Copyright (c) 2023 shadcn | coss ui was looked at as a visual reference only for avatar, calendar and confirm dialog; the files say so and no coss code is in the repo. |
| `lib/meta.ts`, `lib/aeon/agent.ts`, `lib/aeon/tools.ts`, `lib/aeon/reflect.ts`, `lib/referrals/debrief.ts`, `lib/compliance/research.ts`, `lib/connect/muse.ts`, `lib/frontdesk/extract.ts`, `lib/instagram/critic.ts`, `lib/instagram/graphic.ts`, `lib/growth/image.ts`, `lib/uploads/classify.ts`, `components/shared/dictation-audio.ts`, `scripts/smoke.ts` | API request shapes from [meta-models/meta-model-cookbook](https://github.com/meta-models/meta-model-cookbook) at commit `0a99b987858ec4e49c04fc3f114bf33851e81deb`; `lib/meta.ts` also copies the cookbook's SAM stream normalizer (`07_sam/01_api_basics/typescript/sam-api.ts`) | MIT, Copyright (c) Meta Platforms, Inc. and affiliates | Each function names its notebook or file. |
| `lib/client-forms/forms/screeners.ts` | PHQ-9 and GAD-7 questionnaires, word for word, from phqscreeners.com | Free to use: "No permission required to reproduce, translate, display or distribute" (stated on the official PDFs, per the file) | Developed by Drs. Spitzer, Williams, Kroenke and colleagues with an educational grant from Pfizer Inc. The attribution line is printed on the form. |
| `lib/forms/cms855i-05-23.pdf` | CMS-855I Medicare enrollment form (05/23 edition) from CMS | US government work, public domain (17 U.S.C. 105) | Filled in by the app; the clinician signs and submits. |
| `lib/compliance/rules/us.ts`, `lib/compliance/rules/il.ts`, `data/payers/*.json` | Short quotes from official and payer web pages (each with its URL and checked date) | Government text: public domain or edicts of government. Payer and company pages: their owners' copyright; quoted briefly as citations **[UNCONFIRMED: no per-quote rights review]** | See section 4. |

**Rewritten from scratch, no longer adapted code (2026-11-04):** `components/agent-blob/blob-canvas.tsx`, `components/shared/prompt-bar.tsx`, `components/shared/spring-check.tsx`, `components/shared/status-mark.tsx`, `components/shared/thought-line.tsx` and `components/shared/voice-pill.tsx` were once adapted from React Bits (MIT + Commons Clause). To remove the Commons Clause conflict with the AGPL they were rewritten as original Practice-OS code, clean room (only the exported names and props, the call sites and the tests were used; the old bodies and the React Bits source were not opened). They are own code under the AGPL. See open issue 1.

**coss ui and React Bits Pro: none present.** `coss` appears in code only in the three comments above saying it was a reference and not copied; no file is copied from coss.com. React Bits Pro appears only in `docs/ui-elements.md` as private layout screenshots, which are not in the repo.

## 3. AI models

### Meta Muse models (called over the network, not distributed)

Called through the Meta Model API at `https://api.meta.ai/v1` by `lib/meta.ts`, with the clinician's own key (`MODEL_API_KEY`). No weights are in this repo. Use is governed by Meta's API terms **[UNCONFIRMED: terms not reviewed for this file]**.

| Model ID | Used for |
|---|---|
| `muse-spark-1.3` | Aeon's chat, tool calls, research with web search, drafting, structured extraction, image review |
| `muse-image-1.0` | Generated images (Dana Reyes's demo headshot, post backgrounds) |
| `sam-3.1` | Cutting Dana out of her headshot for post graphics |
| `muse-voice-transcribe-1.0` | Dictation in the message box |

### Local name-recognition model (downloaded at runtime)

`lib/aeon/phi-classifier.ts` loads **`Xenova/bert-base-NER`** (int8 ONNX build, about 108 MB) with `@huggingface/transformers` the first time it is needed, or by `npm run models:download`, into `.cache/models` (not committed).

- License: MIT (model cards for [Xenova/bert-base-NER](https://huggingface.co/Xenova/bert-base-NER) and [dslim/bert-base-NER](https://huggingface.co/dslim/bert-base-NER)).
- Base model: `Xenova/bert-base-NER` is an ONNX conversion of `dslim/bert-base-NER`, which is Google's `bert-base-cased` fine-tuned for named-entity recognition (person, location, organization, misc).
- Training data: the English CoNLL-2003 NER dataset (Reuters news articles). The model card notes it is limited to that era and domain. The CoNLL-2003 text itself is not distributed with the model **[UNCONFIRMED: Reuters corpus terms not reviewed]**.

## 4. Data sources

| Source | Where in the code | Terms | How the app credits it |
|---|---|---|---|
| NPPES NPI Registry API (CMS) | `lib/referrals/nppes.ts`, `lib/credentialing/store.ts` | US government public data | Named as "the NPI Registry" in the sources line |
| CMS Provider Data Catalog: Hospice General Information (`yc9t-dgbk`), Home Health Care Agencies (`6jpm-sxkc`), Doctors and Clinicians (`mj5m-pzi6`) | `lib/referrals/sources/cms-agencies.ts`, `lib/referrals/sources/cms.ts` | US government public data | "CMS Provider Data Catalog" with date |
| CMS Medicare Order and Referring, Opt Out Affidavits (data.cms.gov) | `lib/referrals/sources/cms.ts` | US government public data | "the CMS Medicare files" |
| Illinois IDFPR Professional Licensing (data.illinois.gov `pzzh-kp68`) | `lib/referrals/sources/state-license.ts` | ODbL 1.0, attribution "IDFPR" (portal metadata) | "Illinois Department of Financial and Professional Regulation (IDFPR), via data.illinois.gov, ODbL 1.0" in the sources line (`components/referrals/evidence-box.tsx`) |
| OpenStreetMap via Overpass API (`overpass-api.de`) | `lib/referrals/sources/osm.ts`, `osm-orgs.ts` | ODbL 1.0 (attribution, share-alike for public derived databases) | "© OpenStreetMap contributors (ODbL)" with link, wherever OSM data shows. **Open issue 4.** |
| OpenStreetMap Nominatim (typed place search) | `lib/referrals/geocode.ts` | ODbL data; Nominatim usage policy (one request a second, named User-Agent) | The code queues calls at 1.1 s and sends a User-Agent |
| OpenFreeMap vector tiles (`tiles.openfreemap.org`, OpenMapTiles schema, Natural Earth relief) | `components/referrals/referral-map.tsx` | OpenFreeMap is MIT; data is OpenStreetMap (ODbL); attribution required ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") | The tile source carries the attribution and MapLibre shows it in the map corner (`attributionControl: { compact: false }`) |
| US Census 2020 ZCTA Gazetteer (`2020_Gaz_zcta_national.txt`) | `lib/referrals/zcta-centers.json`, `lib/referrals/geo.ts`, `lib/referrals/area.ts` | US government work, public domain | Credited in code comments |
| US Census Geocoder (batch address lookup) | `lib/referrals/geocode.ts` | US government service, public | Not shown in the app |
| NUCC Health Care Provider Taxonomy v26.1 | `docs/research/referral-sources.json` | NUCC code set **[UNCONFIRMED: NUCC terms not reviewed]** | Listed in the research file |
| Payer catalog (`data/payers/national.json`, `il.json`, `prerequisites.json`) | Insurance helper | Facts and short quotes from 19 / 14 / 11 distinct sites (Aetna, Evernorth, Optum Provider Express, Humana, Carelon, CMS, CAQH, Alma, Headway, Grow Therapy, Rula, SonderMind, Illinois HFS, BCBSIL, Molina, CountyCare, TriWest and others), each with a URL | Each step shows its source link |
| Compliance rules (`lib/compliance/rules/us.ts`, `il.ts`) | Admin deadlines | Federal and Illinois statutes and rules (eCFR, ilga.gov, IRS, CMS, DOL, IDFPR, IDES, City of Chicago), plus CAQH, APA, compact sites; each rule has a source URL, quote and checked date | Shown with each rule |
| `docs/research/referral-sources.json` | Referral tiers research | NUCC taxonomy, NPPES API, CMS Provider Data Catalog (`yc9t-dgbk`, `6jpm-sxkc`), OpenStreetMap Map Features wiki, 42 CFR 418.64 and 482.90 (eCFR) | Research file |
| Practices' own websites | `lib/referrals/email/fetch.ts` | Read at runtime for a public contact email; robots.txt honored, honest User-Agent | The source page is shown with the fact |
| Firecrawl (self-hosted) | `tests/rule-sources.test.ts`, optional `FIRECRAWL_URL` in `.env.example`; `lib/compliance/rules/il.ts` notes the Illinois sources were read through it | Firecrawl is AGPL-3.0 (github.com/firecrawl/firecrawl). It runs as a separate server reached over HTTP; none of its code is in this repo | Not user-facing |

Other services the app talks to when the clinician connects them (not data sources, nothing of theirs is in the repo): Google (sign-in, Calendar free/busy, Gmail drafts), Instagram Graph API, Twilio, Cal.com, and Vercel Blob (relay). Each is used under that company's own terms with her own account.

## 5. Fonts, icons and assets

| Item | Source | License |
|---|---|---|
| Inter (UI font) | Loaded by `next/font/google` in `app/layout.tsx` (self-hosted at build time) | SIL Open Font License 1.1 |
| Inter (post graphics) | `@fontsource/inter` woff files, drawn with opentype.js in `lib/instagram/graphic.ts` | SIL Open Font License 1.1 |
| Icons | `lucide-react` | ISC |
| `app/favicon.ico`, `app/icon.png` | Aeon's orb, drawn by plain code (`scripts/make-icon.ts`, sharp), 2026-11-04 | Own work |
| `public/demo/dana-reyes-headshot.jpg` | Generated with `muse-image-1.0` (commit 7176b0a) | Model output; ownership per Meta's terms **[UNCONFIRMED]** |
| `db/seed/posts/*.jpg` | Drawn by plain code (`scripts/make-seed-posts.ts`): gradient plus Inter text | Own work (Inter under OFL) |
| `docs/screenshots/**`, `tests/e2e/*-snapshots/**` | Screenshots of Practice-OS itself | Own work |
| `docs/sms/opt-in-proof.png` | Image for Twilio's SMS opt-in review (commit 248467a) | Assumed own work **[UNCONFIRMED]** |
| `lib/forms/cms855i-05-23.pdf` | CMS | Public domain (see section 2) |

## 6. AI-assisted authorship

Isaiah Tennell does not write code by hand. Practice-OS was built during the Meta Global AI Developer Hackathon (Oct 26 - Nov 4, 2026) by AI coding agents working under his direction: he set the goals, rules and design, reviewed each step and approved every merge.

- **Claude Code (Anthropic)** wrote most of the code. Of 380 non-merge commits on this branch, 373 carry a `Co-Authored-By: Claude` trailer (372 Claude Opus 5.5, 1 Claude Sonnet 5.5).
- **OpenAI Codex**: a branch named `codex/pr108-finish` was merged on 2026-10-30, which suggests Codex worked on PR #108 (website chat safety) **[UNCONFIRMED: the commits carry no tool trailer]**. The 7 commits without a Claude trailer include that PR's commits.
- **Muse Code (Meta)** was used as a clinician-side agent to drive Practice-OS's MCP tools in a live demo (`docs/BUILD_LOG.md`, 2026-10-27). The build log does not show it writing repo code.
- **Muse Spark** (through the app) drafted some content at runtime, such as researched state rules, which the code checks against their official sources before they are kept.

Isaiah is the author and copyright holder of the project as a whole. AI-written code may have limited copyright protection in some countries; the AGPL applies to whatever is protected.

## License texts

- MIT (shadcn/ui, meta-model-cookbook and most dependencies): permission is granted free of charge to use, copy, modify, merge, publish, distribute, sublicense and sell, provided the copyright notice and permission notice are included. Full text: https://opensource.org/license/mit. Copyright notices: shadcn/ui, "Copyright (c) 2023 shadcn"; meta-model-cookbook, "Copyright (c) Meta Platforms, Inc. and affiliates".
- SAM License (Meta): `node_modules/@meta-sam/parser/LICENSE` after install.
- SIL Open Font License 1.1: https://openfontlicense.org.
- Open Database License 1.0: https://opendatacommons.org/licenses/odbl/1-0/.
- Every dependency's own license file is in `node_modules/<package>/` after `npm install`.
