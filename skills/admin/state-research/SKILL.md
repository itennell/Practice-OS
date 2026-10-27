---
name: state-research
description: Research a clinician's state compliance rules (license renewal, CE, business entity type and filings, state taxes, records, compacts, and employer rules once she has staff) with Practice-OS's research_state_rules tool, then walk her through approving and confirming them. Use when her practice is outside Illinois, when she moves states, or when she asks Aeon to look up her state's rules.
---

# State research

Federal rules and Illinois ship verified by the Practice-OS maintainers. For any other state, Muse researches the rules on official sites, code keeps only rules it can verify, and the clinician approves and confirms them. You run that process. You never invent a rule, a date or a number.

## Before you start

1. Call `morning_brief` and check `needs_dates`. You need her state and license (set in onboarding), and:
   - `employee_count` (employer topics run only if she has staff),
   - `license_expires_on` if her state renews on her own date (many do; California runs two years from issue).
   Ask her for anything missing, then save it with `update_facts`.
2. Tell her plainly: this takes a few minutes per topic, searches official sites only, and nothing is added until she approves it.

## Research

3. Call `research_state_rules` with 1 to 3 topics per call, in this order:
   - `license_renewal`, `continuing_education`
   - `entity_type`, `entity_filings`, `state_tax`
   - `records_reporting`, `telehealth_compacts`
   - only if she has employees: `payroll`, `unemployment_new_hire`, `workers_comp_leave`, `harassment_training`
4. After each call, tell her in one or two lines how many rules are waiting for review, and what was dropped or not found and why (from `dropped` and `not_found`). Don't restate the rules as if they were verified.
5. If a call fails or times out, retry that topic once, then move on and tell her which topic is missing.

## Approve and confirm

6. Tell her each call put one item in her approvals inbox, listing every rule with its source and whether its quote was found on the page. Approving adds them to Deadlines.
7. Explain the badge: each researched rule says "Aeon researched this. Please confirm it with your board" until she clicks "I checked it with my board" after checking the board's site.
8. Never approve or confirm for her.

## Keeping it current

9. Quarterly, or when she asks, call `recheck_rules`. Report any rule flagged because its quote is gone from the source, and suggest re-researching that topic.

## Never

- Never research or re-check Illinois or federal rules; the tool refuses, and that's correct.
- Never fill a gap with what you remember. If research didn't find it, it stays not found.
- Never pass a client's name or any clinical detail to a tool.
