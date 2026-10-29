# Aeon shell and home: critique and Cal.com pattern mapping

Research for the "calm like Cal.com" redesign (2026-10-28). Companion to `calcom-ui-study.md`. Nothing here is shipped yet; the build waits for Isaiah's OK on the visual plan.

Method note: impeccable critique run in a single context (the design review and the detector were not split into two sub-agents), so treat the scores as one reviewer's view. The deterministic detector (`impeccable detect`) found 0 issues in `components/sidebar.tsx`, `components/aeon-chat.tsx`, `components/approval-ask-bar.tsx`, `app/(app)/page.tsx` and `app/(app)/layout.tsx`. Before screenshots: light and dark, 1440x900 and 390x844.

## 1. Critique of the current home and shell

### Heuristic scores

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Approvals and the brief are visible, but as three competing blocks (ask bar, two cards) |
| 2 | Match with the real world | 4 | Plain words everywhere; "Practice co-owner" and the disclaimer read well |
| 3 | User control and freedom | 3 | New chat, Not now, mode picker all present |
| 4 | Consistency and standards | 3 | Suggestions are 72px tiles here but chips everywhere else; the approval bar mixes a 52px primary pill with a link |
| 5 | Error prevention | 4 | Mode picker asks before Bypass; disclaimer under the box |
| 6 | Recognition over recall | 3 | Suggestions help; they are fixed text, not built from what is actually due |
| 7 | Flexibility and efficiency | 3 | Shift+Tab mode switch; no quick "Ask Aeon" from other pages |
| 8 | Aesthetic and minimalist design | 2 | Six stacked bands above the fold on desktop (blob, title, subtitle, three tiles, approval bar, input, disclaimer, two cards); on phones the input is below the fold |
| 9 | Error recovery | 3 | Refused text returns to the box with a reason |
| 10 | Help and documentation | 3 | The disclaimer and the "How do I" guides exist; not reachable from Home |
| | **Total** | **31/40** | Good, held back by density |

### Design specificity

The parts are Aeon's own (Liquid Aeon with eyes, the mode picker, the approval ask bar, [Sample] labels), but the composition is the generic chat-app template: big mascot, greeting, tiles, box, cards. The product's character comes from the orb; the layout around it is interchangeable.

### What works
1. Liquid Aeon at the top gives the home a face without decoration elsewhere.
2. Copy is plain and honest ("Aeon handles practice logistics, not clinical advice").
3. The dark menu's information is right: practice links with counts, recent chats, the clinician at the bottom.

### Priority issues
- **[P1] Too many bands above the fold.** Desktop shows 8 stacked elements before any breathing room; on a 390px phone the message box is below the fold, so the one thing Home is for is hidden. Fix: title, one input pill, three chips; everything else below the fold as one quiet list.
- **[P1] Three different "things waiting" surfaces.** The approval ask bar, the "Waiting for you" card and the Approvals badge all say the same thing in three styles. Fix: one quiet "Today" list under the input (approvals count row plus the next deadlines), the ask bar slimmed to one line attached to the input, the menu count kept.
- **[P2] The dark menu is loud in light mode.** A #1F1E1D rail beside a #FAF9F5 page is the strongest contrast on screen, so the eye lands on navigation, not on Aeon. Fix: the menu takes the page colour (one step darker in dark mode), with a hairline edge; icons 16px, labels 14px, counts as plain muted numbers.
- **[P2] Suggestion tiles look like cards.** 72px white tiles with shadows compete with the input. Fix: 40px quiet chips (muted text, hairline), centred under the input, built from real data ("What's due before Nov 6?").
- **[P3] The input is a two-row box.** It reads as a form, not a single question. Fix: a 56px pill that grows when typing, mode picker inside on the left, mic and send on the right.

### Persona red flags
- **Dana, first week (non-technical, 95-year-old accessibility bar):** on her phone she sees the blob, a two-line greeting and three big tiles, and has to scroll to find where to type.
- **Dana, busy Monday:** to see what is due she reads two cards side by side whose links ("All deadlines", "Open approvals") are small 13px text.

## 2. Pattern mapping (DESIGN.md style)

Every Cal.com pattern (P-numbers from `calcom-ui-study.md` section 4) mapped to the Aeon component that takes the role. Tokens are `app/globals.css`; components are from `docs/ui-elements.md`.

| Cal.com pattern | Aeon role | Existing component | Change |
|---|---|---|---|
| P1 flat page, header same colour as page | App canvas and phone top bar | `app/(app)/layout.tsx`, `Sidebar` phone header | Phone header loses its border-bottom; canvas stays `--bg` |
| P2 quiet left nav | Dark chat menu (UI-005) | `components/sidebar.tsx` | New `--nav-*` tokens (page-coloured in light, `#1F1E1D` in dark); 16px icons, 14px labels, rows stay 44px; "Aeon" header becomes the orb + wordmark only; New chat a quiet row with a `⌘K`-free plus icon; section labels sentence case 12px; counts plain muted numbers (Approvals keeps an accent dot when > 0) |
| P3 one title, one input, three chips | Chat-first home (UI-026) | `components/aeon-chat.tsx` | Liquid Aeon 72px (still the live blob, AGENTS.md), greeting as a display title (UI-019 text: "Good afternoon, Dana"), subtitle removed |
| P3 input pill | Prompt Bar (UI-011) | `components/shared/prompt-bar.tsx` | New `shape="pill"`: one row, 56px, grows to 4 lines; `controls` (mode picker) stays inside, left |
| P4 small context chips | Suggestion chips | `chipClass` in `components/ui.tsx` | 40px quiet chips (muted text, hairline, transparent); text from the morning brief and approvals, falling back to the fixed three |
| P5 assistant one tap away | Ask Aeon | `Orb` | New `AskAeonButton` (gap): 48px orb button bottom-right on every non-chat page, opens `/?ask=` |
| P6 list card with hairline rows | Approvals inbox, Admin list, morning brief | `ApprovalsInbox`, `GlassCard` | New `ListCard` + `ListRow` (gap) |
| P7 shared empty state | Empty chats, approvals, referrals, front desk | none (each page writes its own) | New `EmptyState` (gap): icon tile (lucide), title, one sentence, one `Button` |
| P8 Save only when changed | Settings forms | `settings-controls.tsx` | Settings save buttons disabled until dirty |
| P9 destructive last, red | Menus, confirm | `ConfirmDialog` (UI-028) | Already the rule; reused in the new `Menu` |
| P10 dividers instead of nested cards | Settings, Admin forms | `GlassCard` | `PageSection` with a top hairline instead of a card where a page has only one group |
| P11 tiny state tags | Status | `StatusPill` (UI-010) | Unchanged |
| P13 one display title | Home greeting, page titles | `--text-title` | New `--text-display` token (40px/1.1/650/-0.02em) used only on Home |
| Row "…" menus, filter popover | Row actions on Approvals, Referrals | none shared (Base UI Menu is available) | New `Menu` (gap): Base UI Menu, 44px rows, lucide icons, danger last |
| Approvals visible but quiet | Approval ask bar | `components/approval-ask-bar.tsx` | One 48px line attached above the input: dot, "6 waiting for you", "Review" chip; the full card opens on tap |
| Morning brief visible but quiet | Brief on Home | `StartCards` in `app/(app)/page.tsx` | Becomes a "Today" `ListCard` under the disclaimer: next 3 deadlines and the approvals row |
| Thinking state | Thought Line (UI-014) | `ThoughtLine` | Unchanged |
| Side panel for forms | Admin side panel | existing sheet | Unchanged; adopts `--nav-*` hairlines |

### New tokens (all pass `scripts/contrast.ts` before use)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--nav-bg` | `#FAF9F5` (= canvas) | `#1F1E1D` | Menu background |
| `--nav-fg` | `#1F1E1D` | `#F5F4EF` | Active row text |
| `--nav-muted` | `#65635C` | `#B5B3AB` | Rows, icons, section labels |
| `--nav-hover` | `rgb(31 30 29 / .05)` | `rgb(255 255 255 / .06)` | Row hover |
| `--nav-active` | `rgb(31 30 29 / .07)` | `rgb(255 255 255 / .1)` | Current row |
| `--nav-line` | `#E3E1D9` | `rgb(255 255 255 / .08)` | Menu edge |
| `--line-strong` | `rgb(31 30 29 / .18)` | `rgb(255 255 255 / .16)` | Input pill border (3:1 against the canvas for the control outline is carried by `--fg-muted` on focus) |
| `--text-display` | 2.5rem / 1.1 / 650 / -0.02em | same | Home title only |
| `--radius-control` | 12px | same | Selects, menus, list cards' inner rows |

The dark menu stays dark in dark mode; in light mode it follows the page. This changes UI-005's "dark in both themes" rule and needs Isaiah's OK (open question in the visual plan).

### Gaps that need a new shared component
1. `EmptyState` (components/shared/empty-state.tsx)
2. `ListCard` + `ListRow` (components/shared/list-card.tsx)
3. `Menu` (components/shared/menu.tsx, Base UI Menu)
4. `AskAeonButton` (components/shared/ask-aeon-button.tsx)
5. `PageHeader` (title, one-line description, one action) in components/ui.tsx

Each is added to docs/ui-elements.md as a new UI number when built.
