# Cal.com UI study (research, not shipped UI)

Walked on 2026-10-28 in Isaiah's signed-in Cal.com account, read-only: nothing was saved, toggled, booked or deleted. Tabs, menus, popovers and dialogs were opened and closed with Escape. Personal details (his name, booking-link slug, email) were blurred in the page before each screenshot.

**License note.** Cal.com is AGPL-3.0. This file records patterns, measurements and impressions only. No Cal.com code, icons, logos, fonts or exact layouts go into Practice-OS; everything is rebuilt from our own components (docs/ui-elements.md) and tokens (app/globals.css).

**Viewport note.** The Chrome window was locked at 757 x 862 CSS px during the walk (resize refused), so Cal.com served its phone/tablet layout: top bar plus a floating bottom dock instead of the left nav. The desktop left nav is described from Isaiah's own screenshot of the Cal.ai home and is marked *desktop, from Isaiah's screenshot* below. Desktop captures are added (`d*.jpg`) if a wider window becomes available.

Screenshots: `docs/research/calcom-ui-study/` (`m` = 757px layout, dark unless named `-light`).

## 1. The overall feel in one paragraph

Cal.com's app is one flat near-black surface (#111 in dark, #F8F8F8 in light) with almost no cards on the home screen. Hierarchy comes from type weight and empty space, not from boxes, shadows or colour. Lines are hairlines at 6-16% white/black. Everything interactive is either a full pill (input, chips, dock, primary button) or a 10px-radius rounded rectangle (list cards, selects, dialogs). Colour is reserved for state: a green "Default" badge, an amber "Hidden" badge, a red "Delete" row, a blue link. The brand colour barely appears in the product chrome.

## 2. Measured tokens (computed styles, dark and light)

| Thing | Dark | Light | Notes |
|---|---|---|---|
| Page background | `#111111` (srgb .068) | `#F8F8F8` (lab 98.3) | Header uses the same colour as the page: no separate bar colour |
| Ink | `#FFFFFF` | `#242424` (lab 15.2) | Pure white ink in dark |
| Muted text (chips) | `#818181` | `#696969` | Chips use muted text, not ink |
| Hairline | white 6% (body), 8% (chips) | black 8-10% | 1px everywhere |
| Input border | white ~16% | `oklab(.27 / .16)` | The one slightly stronger line on the page |
| Raised surface (dock) | `#1D1D1D` | white | Floating dock, one soft shadow `0 10px 15px -3px / 5%` |
| Radius | pill (`9999px`) for input, chips, dock, round buttons; `--radius: .625rem` (10px) for cards, selects, dialogs |
| Font | Body "fontSans" (Inter-like grotesk) 16/24; headings "fontHeading" (Cal Sans-style display) | | We keep Inter (AGENTS.md); the lesson is tight display tracking on the one big title |
| Weights | 400 body, 500 chips and buttons, 600-700 headings | | |

### Home (Cal.ai) geometry at 757px wide

| Element | Size | Style |
|---|---|---|
| Top bar | 56px tall, 16px side padding | logo left; search icon and avatar right; no border, same colour as page |
| Second bar ("New chat ▾") | ~48px | hairline under it; chat switcher is a text button with a chevron |
| Title "Ask Cal.ai" | ~36px display, centred, ~40% down the screen | bold display face, tight tracking, ink colour |
| Input pill | 648 x 52px, 9px padding, 1px border, fully round | left: small animated Cal.ai glyph; placeholder "Ask anything..."; right: 28px round send button (ink fill, page-colour arrow) |
| Suggestion chips | 24px tall, 12px/500, 7px side padding, pill, 1px hairline, faint fill | three, centred, 8px gap, 12px below the input; context-aware text ("Edit "Secret meeting"", "Is my calendar connected?") |
| Floating dock (phone layout) | 198 x 54, pill, 4px padding | four 40px icon buttons: Links, Bookings, Availability(calendar), More (…); active one gets a soft filled square |
| Cal.ai button (other pages) | 40px round, bottom-left | the same Cal.ai glyph floats bottom-left on every screen so the assistant is one tap away |
| New (+) | 40px round, white fill, bottom-right | the page's create action; only on list pages |

## 3. Screen-by-screen catalog

### Home / Cal.ai — `m01-home-calai.jpg`, light `m22-home-calai-light.jpg`
- Layout: one centred column, max ~650px, vertically centred slightly above middle. Nothing else on the page: no brief, no cards, no stats.
- Nav: top bar + dock (phone); *desktop, from Isaiah's screenshot*: a quiet left nav, small 16px line icons with 14px labels, no section boxes, active item a faint filled rounded row.
- States: empty chat history shows an empty-state popover (`m03`), not an empty page.
- Copy tone: two words of title, "Ask anything...", chips written as things you'd actually ask.
- Interaction: chips fill and send; the "New chat ▾" popover lists past chats.

### Chats popover, empty — `m03-home-chats-popover-empty.jpg`
- 280px popover under the trigger, 10px radius, raised surface one step lighter than the page, hairline border.
- Empty state pattern used across the product: small icon in a 32px rounded square with hairline, bold one-line title ("No conversations yet"), one muted sentence, one small white pill button.

### More sheet (phone) — `m02-home-more-sheet.jpg`
- Bottom sheet with grab handle, page dims behind it. Rows: 16px icon + 14px label, ~32px tall, groups split by a hairline. Items with sub-menus get a chevron on the right. Same pattern for the user menu (`m18`).

### Links (event types) — `m04-links-list.jpg`
- Search field (pill-ish, 10px radius) on top, then one bordered card holding all rows, rows split by hairlines (a list, not a grid of cards).
- Row: bold 14px title + muted slug inline; meta line of tiny pills ("15m" with clock icon, amber "Hidden" badge); description in muted; a 28px square "…" button on the right.
- Labels: tiny 11-12px tags with tinted fills; colour only for state.

### Row menu, phone sheet — `m05-links-row-menu-sheet.jpg`
- Actions as a bottom sheet: Preview, Copy link, Copy ID, Share, Troubleshoot, Edit, Duplicate, Publish; a switch row ("Show on Profile"); Delete alone in red at the bottom, after a hairline.
- Lesson: destructive action separated and coloured; settings-like toggles live in the same menu as a switch row.

### New link dialog — `m06-links-new-dialog.jpg`
- Centred dialog, ~470px, 16px radius, raised surface. Title 18px bold + one muted sentence. Labelled fields stacked (label above, 36px inputs with suffix "Minutes" inside the field). Radio cards for type (title + muted one-liner, radio on the right, selected card gets a brighter border).
- Footer: quiet text button "Close" + small white pill "Continue", right-aligned, on a slightly darker footer band.

### Link settings (event detail) — `m07`-`m11`
- Header: back arrow, title, "…" menu, disabled "Save" pill (enabled only when dirty: clear state).
- Tabs: horizontal scroll row of icon + label tabs (Basics, Availability, Booking form, Confirmation, Appearance, Payments & Seats, Recurring, …); active tab is a faint filled pill.
- Sections divided by full-width hairlines, no cards: label 14px/600, helper 13px muted, control under it.
- Availability tab (`m08`): read-only summary card of the chosen schedule, crossed-out days for unavailable, "Edit availability ↗" link.
- Booking form tab (`m09`): list of questions, each with tiny status tag (Required / Hidden / Optional), a switch and an "Edit" chip.
- Appearance tab (`m10`): picture radio cards (layout thumbnails) with checkboxes under them; segmented control (Month / Weekly / Column).
- "…" menu (`m11`): dropdown, 10px radius, 14px rows with icons, Delete in red, a switch row at the bottom.

### Bookings — `m12-bookings-empty.jpg`, filter `m13-bookings-filter-popover.jpg`
- Segmented text tabs (Upcoming, Unconfirmed, Recurring, Past, Canceled), active = faint fill. "Filter" and "Saved filters" as small outlined buttons on the same row.
- Empty state: dashed-border box, icon tile, bold title, one helpful sentence ("As soon as someone books a time with you it will show up here.").
- Filter popover: search field at top, "AI filter" first, then a plain list of fields. Command-menu feel.

### Availability — `m14-availability-list.jpg`
- One card per schedule: bold name + green "Default" badge, muted summary line ("Mon - Fri, 9:00 AM - 5:00 PM"), globe + timezone, "…" button. A footer band inside the card for the secondary action ("Temporarily out-of-office? Add a redirect").

### Apps — `m15-apps-store.jpg`
- Two text tabs (App store / Installed apps), search, then large photographic category cards with a frosted label panel, and horizontal carousels with arrow buttons. The one place with imagery; it's a marketplace, so it's Persuade mode inside the app.

### Workflows — `m16-workflows-empty.jpg`
- Page title top-left (20px bold), then the shared empty state: icon tile, "Create your first workflow", one sentence, white "Create" pill.

### Insights — `m17-insights-upsell.jpg`
- Locked-feature upsell: a large raised card with a small "Insights" tag, bold headline, muted paragraph, "Show more", and a light product screenshot. Not relevant to Practice-OS (we never upsell), noted only for completeness.

### User menu — `m18-user-menu-sheet.jpg`
- Sheet: account name as a muted header, then My profile, My settings, Out of office; hairline; Help, Download app; hairline; Sign out in red.

### Settings — `m19-settings-general.jpg`, `m20-settings-appearance.jpg`, nav `m21-settings-nav-drawer.jpg`
- Settings is its own shell: top bar with back arrow, centred page title, hamburger for the settings nav.
- Settings nav (drawer here, a second left column on desktop): grouped by account, Security, Billing, Developer; group headers with an icon, children indented as plain text rows, active row a faint filled rounded rectangle.
- Each settings group is a card with labelled selects stacked, and a small grey "Update" pill bottom-right of the card that only lights up when something changed.
- Single toggles are their own small cards: bold label, muted explanation, switch on the right.
- Appearance uses picture radio cards (System default / Light / Dark thumbnails).

## 3b. Desktop layout (UNVERIFIED: from Isaiah's desktop screenshots and Cal.com's public docs, not a live capture)

The live walk could only see the 757px layout. These notes come from Isaiah's own desktop screenshots described in the orchestrator's brief (Cal.ai home, Links, an event's settings) and Cal.com's public help pages. Verify them live when a wide Chrome window is available.

- **Shell:** a left sidebar list (about 220-240px) on the same near-black as the page: workspace/avatar at the top, then Home (Cal.ai), Links (event types), Bookings, Availability, Teams, Apps, Routing, Workflows, Insights; small 16px line icons with 14px labels; the current item is a faint filled rounded row; secondary items (View public page, Copy link, Settings) sit at the bottom. No section boxes, no shouting badges.
- **Cal.ai home:** the content column is centred in the remaining width: the large "Ask Cal.ai" title, one input pill under it, three small chips under that, and nothing else on the page.
- **Event settings (desktop):** a three-part layout. Left: a sub-nav grouped under small headings (Setup, Booking experience, Policies, AI & Automation), each group a short list of text rows with the current one filled. Middle: the settings form for the chosen row, sections split by hairlines. Right: a live booking preview of what the person booking will see, updating as settings change.
- **Lesson for Aeon:** the live preview pattern fits Admin's side panel and the Instagram composer (show the result beside the form). The grouped sub-nav fits Settings (Practice, Connections, Approvals, Aeon) once it grows past one page.

## 4. Patterns worth taking (and what we do instead)

| # | Cal.com pattern | Why it works | Take it? |
|---|---|---|---|
| P1 | One flat page colour; header the same colour as the page | Calm: nothing competes with the content | Yes. Our canvas #FAF9F5 / #262624 already does this; drop the extra card-on-card on Home |
| P2 | Quiet nav: small line icons, 14px labels, faint filled active row, no badges shouting | The nav recedes; the work is the page | Yes, applied to our dark chat menu (UI-005) |
| P3 | Home = one big title, one input pill, three small chips, nothing else above the fold | One obvious next step | Yes for Aeon's home; brief and approvals move below the fold as quiet rows |
| P4 | Suggestion chips are small (24px) and context-aware | They read as hints, not buttons | Partly: our chips must stay 40-44px (touch rule), but quieter (muted text, hairline) and context-aware from real data |
| P5 | Assistant glyph floats on every other page | The assistant is always one tap away | Yes: Aeon's small orb as a "Ask Aeon" button on non-chat pages |
| P6 | Lists are one bordered card with hairline-split rows, not card grids | Scannable, dense, calm | Yes for Approvals, Admin list, Referrals list |
| P7 | Shared empty state: icon tile, bold line, one sentence, one small pill | Consistent, helpful, not cute | Yes: new shared `EmptyState` (gap) |
| P8 | Save/Update disabled until something changed | Honest state | Yes in Settings forms |
| P9 | Destructive action last, alone, red, after a hairline | Error prevention | Already our rule (UI-028); apply in menus |
| P10 | Section dividers instead of nested cards on detail pages | Less boxiness | Yes on Settings and Admin forms |
| P11 | Status tags tiny and tinted; colour only for state | Colour means something | Yes, already our StatusPill; keep them small |
| P12 | Floating dock on phones | Thumb reach | No: our phone menu is decided (Card Nav UI-020 / slide-in menu). Note only |
| P13 | Display-face title with tight tracking | Brand moment in one place | Yes with Inter 600-700, letter-spacing -0.02em, one place only |

Things we do NOT take: Cal.com's logo, Cal Sans, its icons, the Cal.ai glyph, the dock layout, the exact spacing of the home column, marketplace imagery, upsell cards.
