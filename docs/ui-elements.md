# UI elements (the UI Shelf, filed)

Every UI piece Isaiah picked for Practice-OS, where it goes, and how to build it. Filed from the private UI Shelf on 2026-10-27 after the 2026-10-26 review. **Every chat that builds UI reads this first and uses the shared components listed here instead of making its own.**

- Status words: `built` (in the repo), `approved` (decided, not built yet), `collected` (idea, not decided), `parked` (reference only, not planned).
- Priority: `must` or `nice`.
- Colors always follow the Caseload palette in `AGENTS.md` and the tokens in `app/globals.css`, light and dark. Icons are lucide only (swap any Hugeicons). shadcn/ui pieces use Base UI primitives.
- Rows marked *layout reference* came from screenshots of React Bits Pro demos. We do not have that code and do not copy it; we build our own from free parts. The screenshots stay private and are never committed.
- Licenses: React Bits (free) and shadcn/ui are MIT. coss ui is AGPL-3.0, so it is a visual reference only; use the shadcn/ui equivalent.

## Decisions from the review (2026-10-26)

- Chat-first home: the app opens on a conversation with Aeon; the dashboard and a Kanban-style board are reached from the sidebar.
- Aeon's orb gains a liquid active state (Liquid Aeon, UI-017). Isaiah picked the Chrome surface with eyes on (2026-10-27); eyes only where the clinician sees Aeon, never on the public Front Desk or web chat.
- React Bits is allowed in the app for the picked pieces only (micro controls, Stepper, Card Nav, Liquid Aeon, Liquid Ether, the typing greeting), each checked for speed, accessibility and calm.
- No GSAP in the app. The typing greeting is rebuilt with motion; Animated Content is landing-page only.
- Liquid Ether (living background) for the opening moments only: app opening, onboarding, the demo password page.
- shadcn/ui on Base UI for every shadcn piece; lucide icons everywhere.
- Dictation is clinician-only; the public website chat is typing only.
- Rollout: Stage 1 (now) builds the shared pieces once; Stage 2 (about Nov 2-3) does the screen layouts.

## Spot map

| Code | Screen | What lives there | Elements |
|---|---|---|---|
| GLB | Global | Pieces used on every screen: surfaces, buttons, status, checklists, dialogs, toasts. | UI-001, UI-004, UI-009, UI-010, UI-013, UI-018, UI-028, UI-031 |
| SHL | App shell | Sidebar, phone top bar, Aeon's orb, the profile at the bottom of the sidebar. | UI-002, UI-017, UI-020, UI-029 |
| ONB | Onboarding | Aeon's interview: who you help, how you work, practice stage. | UI-003, UI-022 |
| HOM | Home | The opening view. Chat-first: the app opens on a conversation with Aeon. | UI-019, UI-026 |
| CHT | Chat with Aeon | Message input, bubbles, Aeon thinking, approval cards inside the chat. | UI-005, UI-006, UI-011, UI-014, UI-015, UI-027 |
| APR | Approvals | The approvals inbox. Uses the global Status Mark (UI-010); no screen-only elements yet. | none yet |
| DLN | Deadlines | Compliance calendar and its month view. | UI-030 |
| REF | Referrals | Referral pipeline. No screen-only elements yet; uses the global pieces. | none yet |
| IGM | Instagram | Post composer and content calendar. | UI-023 |
| FDK | Front Desk | Inquiries queue and consult schedule. | UI-025 |
| SET | Settings | Auto-approve, connections, practice details. | UI-007, UI-032 |
| LIB | Library | New page for everything Practice-OS made or stored. | UI-024 |
| TBD | Spot not decided | Collected or parked; no screen yet. | UI-008, UI-012, UI-016, UI-021 |

## All elements

"Shared component" says where the piece lives once built. "to build in Stage 1" means it is being built now as a shared component; until it lands, leave a TODO naming the UI number rather than building your own.

| ID | Element | Screen | Spot | Priority | Status | Source | Shared component |
|---|---|---|---|---|---|---|---|
| UI-001 | Soft blue and purple glass gradients | GLB | Cards and surfaces | must | built | Design board p.8 | `app/globals.css` (`glass`) |
| UI-002 | Animated orb agent | SHL | Aeon orb | must | built | Design board p.8 | `components/ui.tsx` (`Orb`) |
| UI-003 | Chip selectors | ONB | Who you help | must | approved | Design board p.8 |  |
| UI-004 | Pill buttons | GLB | Buttons and chips | must | built | Design board p.8 | `components/ui.tsx` (`Button`, `Chip`) |
| UI-005 | Dark chat menu (ChatGPT style) | CHT | Conversation list | must | approved | Design board p.8 |  |
| UI-006 | Chat bubbles with cut corners | CHT | Aeon bubble | must | approved | Design board p.7 |  |
| UI-007 | Plugins page for connections | SET | Connections | nice | collected | Design board p.8 |  |
| UI-008 | Agent profile page | TBD | Anywhere it fits | nice | collected | Design board p.8 |  |
| UI-009 | Primary button pinned to the bottom on phones | GLB | Buttons and chips | must | approved | Design board p.7 |  |
| UI-010 | Status Mark (animated status icon) | GLB | Status pills | must | built | React Bits (app exception) | `components/shared/status-mark.tsx` (`StatusMark`, `StatusPill`) |
| UI-011 | Prompt Bar ("Ask anything" with dictation) | CHT | Message input | must | approved | React Bits (app exception) | to build in Stage 1 |
| UI-012 | Slide to Commit | TBD | Anywhere it fits | nice | collected | React Bits (app exception) |  |
| UI-013 | Spring Check (check off and cross out) | GLB | Checklists and check-offs | must | built | React Bits (app exception) | `components/shared/spring-check.tsx` (`SpringCheck`) |
| UI-014 | Thought Line (Aeon is working) | CHT | Aeon thinking | must | approved | React Bits (app exception) | to build in Stage 1 |
| UI-015 | Voice Pill (dictation capture) | CHT | Message input | must | approved | React Bits (app exception) | to build in Stage 1 |
| UI-016 | Animated Content (fade and slide in) | TBD | Anywhere it fits | nice | parked | React Bits (reference; marketing fit) |  |
| UI-017 | Liquid Aeon (liquid metal blob for Aeon and the agents) | SHL | Aeon orb | must | approved | React Bits (app exception, adapted) | `components/agent-blob/` (test page built) |
| UI-018 | Liquid Ether (living background) | GLB | App background | must | approved | React Bits (app exception) |  |
| UI-019 | Text Type (welcome greeting) | HOM | Greeting and practice chips | must | approved | React Bits (app exception) |  |
| UI-020 | Card Nav (menu that opens into cards) | SHL | Phone top bar and menu | must | approved | React Bits (app exception) |  |
| UI-021 | Dock (Mac-style magnifying dock) | TBD | Anywhere it fits | nice | parked | React Bits (reference) |  |
| UI-022 | Stepper (onboarding steps) | ONB | Step list | must | approved | React Bits (app exception) |  |
| UI-023 | Attachment (file and image cards) | IGM | Post composer | must | approved | shadcn/ui (MIT) | to build in Stage 1 |
| UI-024 | Library page (file manager layout) | LIB | Whole page | must | approved | Screenshot (React Bits Pro demo, layout reference only) (layout reference) |  |
| UI-025 | Front Desk work queue (list plus schedule panel) | FDK | Inquiries list | must | approved | Screenshot (React Bits Pro demo, layout reference only) (layout reference) |  |
| UI-026 | Chat-first home (the app opens on Aeon) | HOM | Opening view (whole page) | must | approved | Screenshot (layout reference only) (layout reference) |  |
| UI-027 | Approval card in the chat | CHT | Approval card in chat | must | approved | Screenshot (layout reference only) (layout reference) |  |
| UI-028 | Confirm dialog for permanent actions (Alert Dialog) | GLB | Confirm dialogs | must | built | shadcn/ui (MIT); coss ui reference only (AGPL) | `components/shared/confirm-dialog.tsx` (`ConfirmDialog`) |
| UI-029 | Avatar (profile picture) | SHL | Profile (bottom of sidebar) | must | built | shadcn/ui (MIT); coss ui reference only (AGPL) | `components/shared/avatar.tsx` (`Avatar`) |
| UI-030 | Calendar (shared month calendar) | DLN | Calendar | must | approved | shadcn/ui (MIT); coss ui reference only (AGPL) | to build in Stage 1 |
| UI-031 | Toast notifications | GLB | Toasts | must | approved | shadcn/ui (MIT) | to build in Stage 1 |
| UI-032 | Settings controls (switches and selects) | SET | Auto-approve kinds | must | approved | shadcn/ui (MIT) | to build in Stage 1 |

## Build notes

### UI-001 Soft blue and purple glass gradients

**GLB · Cards and surfaces** · must · built · Design board p.8

Background glows (lilac top-left, blue bottom-right) with frosted glass cards on top. Used on every light screen.

### UI-002 Animated orb agent

**SHL · Aeon orb** · must · built · Design board p.8

Aeon is a breathing orb instead of a face or avatar; stays still for people who turn off motion. Used on onboarding, curating and the dashboard.

### UI-003 Chip selectors

**ONB · Who you help** · must · approved · Design board p.8

Pick modalities and specialties with one tap each; selected chips turn dark, unselected stay white with a border.

### UI-004 Pill buttons

**GLB · Buttons and chips** · must · built · Design board p.8

Big rounded primary actions, dark on light (54px), with the purple accent pill (44px) for secondary actions.

### UI-005 Dark chat menu (ChatGPT style)

**CHT · Conversation list** · must · approved · Design board p.8

A dark side menu for talking to Aeon: search, navigation, pinned and recent chats, and a New chat button.

### UI-006 Chat bubbles with cut corners

**CHT · Aeon bubble** · must · approved · Design board p.7

Aeon's bubbles are light with the top-left corner cut; yours are dark with the top-right corner cut.

### UI-007 Plugins page for connections

**SET · Connections** · nice · collected · Design board p.8

A row of connected service icons, a list with + buttons to add more, and a floating search.

### UI-008 Agent profile page

**TBD · Anywhere it fits** · nice · collected · Design board p.8

One page per helper showing its personality, memory, tools and history. The board marked it as the next screen to design.

### UI-009 Primary button pinned to the bottom on phones

**GLB · Buttons and chips** · must · approved · Design board p.7

On phone screens (390 wide, 24px side padding), the main action button sits fixed at the bottom of the screen.

### UI-010 Status Mark (animated status icon)

**GLB · Status pills** · must · approved · React Bits (app exception) · [link](https://reactbits.dev/c/micro/status-mark)

A small icon that morphs from a ring to a spinning arc, then a check, X or strike. Use it everywhere something has a status: loading/running, waiting for sign-off (pending), done, failed, and cancelled or declined. Its states match ours: pending, running, done, failed, cancelled (our 'declined'). Sits next to or inside the status pills. Install: npx shadcn@latest add @react-bits/StatusMark-TS-TW. Needs the motion library. Respects reduced motion and has screen-reader labels.

### UI-011 Prompt Bar ("Ask anything" with dictation)

**CHT · Message input** · must · approved · React Bits (app exception) · [link](https://reactbits.dev/c/micro/prompt-bar?menuBackground=9d9d9d)

The one text box for typing to Aeon, used everywhere there is a chat or prompt: the Chat with Aeon panel (main spot), the dashboard chat box, typed answers in onboarding, and the website chat. Placeholder "Ask anything" plus a microphone button. Turn OFF the model picker and effort picker (pass empty models and efforts lists; they show by default), and leave out the slash commands and sources. DECIDED (Isaiah, 2026-10-26): dictation is for the clinician only; the public website chat is typing only. Swap its Hugeicons for lucide so the app keeps one icon style. Colors follow the Caseload palette (background, color, menuBackground). Dictation wiring: onDictate records in the browser, converts to a mono WAV and sends it to muse-voice-transcribe-1.0. Install: npx shadcn@latest add @react-bits/PromptBar-TS-TW. Needs motion. Respects reduced motion; has screen-reader labels.

### UI-012 Slide to Commit

**TBD · Anywhere it fits** · nice · collected · React Bits (app exception) · [link](https://reactbits.dev/c/micro/slide-commit)

A pill track you slide across (or press Enter / arrow keys) to confirm something deliberate; shows done or error at the end. Spot not decided yet. Good candidates: the moments that act in the outside world after approval, like "Slide to publish" for an Instagram post or "Slide to book" for a consult, so a weighty action can't happen by one stray tap. Colors must follow the Caseload palette: track = border #D4CDF0 on glass, handle = primary #1E1A3A, success = #2F7A55, danger = #A1261B (dark mode: #8E7CF8 accent, #8FD8AE, #FFAEA3). Change the default labels ("Slide to pay" / "Paid") to our words. Install: npx shadcn@latest add @react-bits/SlideCommit-TS-TW. Needs motion and Hugeicons (swap its icon for lucide). Keyboard accessible, respects reduced motion, has screen-reader labels.

### UI-013 Spring Check (check off and cross out)

**GLB · Checklists and check-offs** · must · approved · React Bits (app exception) · [link](https://reactbits.dev/c/micro/spring-check)

The checkbox for every list where things get checked off: a springy check, then the label is crossed out and fades. Use it everywhere something is marked done: deadlines (license renewal, CE hours, CAQH, taxes), referral follow-ups, credentialing prep and how-do-I guide steps, setup and connection checklists in Settings, and onboarding checklists. Not for approvals (those keep Approve / Edit / Decline). Colors follow the Caseload palette: box border #D4CDF0, fill = primary #1E1A3A (or success #2F7A55 for completed), check = white, label = ink #17142B, crossed-out label = muted #5D5878; dark mode uses #8E7CF8 / #8FD8AE / #F1EEFF / #B3ADCF. Add a visible Caseload focus ring (the component has none) and keep the 44px touch target around the box. Install: npx shadcn@latest add @react-bits/SpringCheck-TS-TW. Needs motion; swap its Hugeicons check for lucide. A real button with checkbox role, so Space and Enter work; respects reduced motion.

### UI-014 Thought Line (Aeon is working)

**CHT · Aeon thinking** · must · approved · React Bits (app exception) · [link](https://reactbits.dev/c/micro/thought-line)

Shown whenever Aeon is thinking, working through ideas, or running steps the clinician should see. A breathing, shimmering "Thinking…" line with an expandable list of steps and an optional timer; it settles into a done label (e.g. "Drafted 3 posts") and collapses when finished. Use it in the Chat with Aeon panel (main spot), the onboarding "Aeon is putting your practice together" step, the morning brief, and while Aeon drafts letters, posts or searches referral sources. Glyph: a tiny Aeon orb instead of the default sparkle (glyph accepts any element). Steps must be plain-English summaries of real work Aeon is doing (from actual job progress), never raw model reasoning and never invented progress. Colors follow the Caseload palette: text = muted #5D5878 while working, ink #17142B when done, shimmer and glyph in accent #5B47C9 (dark: #B3ADCF / #F1EEFF / #8E7CF8). Install: npx shadcn@latest add @react-bits/ThoughtLine-TS-TW. Needs motion; swap Hugeicons for lucide. Announced to screen readers as a status; respects reduced motion. Use Status Mark (UI-010) for item status and Thought Line for Aeon's own work.

### UI-015 Voice Pill (dictation capture)

**CHT · Message input** · must · approved · React Bits (app exception) · [link](https://reactbits.dev/c/micro/voice-pill)

The recording state for dictation in the Prompt Bar (UI-011): when the clinician taps the mic, this pill shows a live sound wave and a timer while she talks, with slide-to-cancel. On finish, the recording is transcribed by muse-voice-transcribe-1.0 and the text drops into the Prompt Bar for her to review before sending (nothing auto-sends). On cancel, the audio is discarded and never sent. Wiring: we open the mic ourselves, pass that same stream to the pill (its stream prop) and record it with MediaRecorder; onStop tells us release vs cancel. Mode: tap to start, tap to stop (toggle), so it works on phones and with keyboards. Clinician only, per the dictation decision; the public website chat has no mic. Colors must be remapped to the Caseload palette (its defaults are dark grey): background = glass white / #1E1A3A when recording, wave and accent = #5B47C9, icon = #5D5878 (dark: #121022 / #8E7CF8 / #B3ADCF). The component does NOT respect reduced motion: hold the wave still for those users. Install: npx shadcn@latest add @react-bits/VoicePill-TS-TW. No motion dependency; swap Hugeicons for lucide.

### UI-016 Animated Content (fade and slide in)

**TBD · Anywhere it fits** · nice · parked · React Bits (reference; marketing fit) · DECIDED: landing page only; no GSAP in the app. · [link](https://reactbits.dev/c/animations/animated-content)

Reference for later. Wraps any block so it fades and slides into place (optional blur, scale, stagger), usually as you scroll. Spot not decided. Best fit: the public Practice-OS landing page or the hackathon demo page, where scroll reveals suit a marketing page. Inside the app, use it sparingly or not at all: content starts invisible and arrives 100px away over 0.8s, which slows people doing tasks; if we want a reveal in the app (e.g. new items arriving in the approvals inbox, onboarding steps), copy the idea with a short 150-250ms fade-up using motion (already used by the other pieces) instead of adding GSAP. Colors: none of its own. Install: npx shadcn@latest add @react-bits/AnimatedContent-TS-TW. Needs GSAP with ScrollTrigger; DECIDED: no GSAP in the app, landing page only. Respects reduced motion.

### UI-017 Liquid Aeon (liquid metal blob for Aeon and the agents)

**SHL · Aeon orb** · must · approved · React Bits (app exception, adapted) · DECIDED 2026-10-27: Isaiah saw the standalone test (/ui-lab/aeon) and picked Chrome surface with eyes on for Aeon (clinician-facing only; never on public Front Desk or web chat). Ready to go into the app in Stage 2. · [link](https://reactbits.dev/c/animations/blob-cursor)

Isaiah loves this look: turn the Blob Cursor's liquid metal blob into how Aeon and every agent looks when they appear and work. Not a cursor: the blob is driven by what the agent is doing. Resting = today's breathing orb (1 to 1.06 over 4s) rendered as liquid metal tinted with Aeon's gradient (white, #E3D9FF, #8E7CF8, #4E69DA). Popping up (chat opens, Aeon appears, onboarding) = a playful splash and settle. Working (thinking, drafting, searching; pairs with Thought Line UI-014) = livelier wobble, stretch, and small splits that rejoin. Helper agents use the same blob in their colors: Front Desk blue #5B9BF0 to #2E5CC8, Referrals violet #A77BF0 to #6A3FC8, Instagram pink #E07BC4 to #8C44B8. Reduced motion = the still gradient orb. Use the live blob only for the big moments (large Aeon in onboarding and the chat panel, the agent that is actively working); small orbs (sidebar, list badges) stay the cheap CSS breathing orb, because browsers cap how many WebGL canvases can run at once. Load three.js only on screens that show a live blob. Built from the component's three.js shader (material chrome, color, shine, wobble, morph, splash props). Needs an AGENTS.md design-system update (orb gains a liquid active state) with Isaiah's OK at build time. Install: npx shadcn@latest add @react-bits/BlobCursor-TS-TW, then adapt into an AgentBlob component. Respects reduced motion.

### UI-018 Liquid Ether (living background)

**GLB · App background** · must · approved · React Bits (app exception) · DECIDED 2026-10-26: live background for the opening moments only; everyday screens keep the still glows. · [link](https://reactbits.dev/c/backgrounds/liquid-ether)

A slow, living fluid background that drifts on its own (autoDemo on, cursor force 0, click bursts off), so the app feels alive the moment it opens. DECIDED (2026-10-26): live version for the opening moments only (app opening, onboarding interview, and the password page of the online demo copy; the local app has no sign-in); the everyday screens (Home, approvals, deadlines) keep the current still glows. Colors from the Caseload palette in light mode: lilac #E2D8FF, blue #C9DBFF, soft violet #8E7CF8 at low intensity over #F5F3FC; dark mode: #100D24 base with #8E7CF8 and #4E69DA. Glass cards (64% white, 18px blur) sit on top, which keeps text readable. Plain WebGL with no extra libraries; pauses itself when off screen or the tab is hidden; respects reduced motion (still gradient instead). Keep resolution at 0.5 and cap pixel ratio for speed. Works alongside Liquid Aeon (UI-017): onboarding would run two WebGL canvases, which is fine. Install: npx shadcn@latest add @react-bits/LiquidEther-TS-TW.

### UI-019 Text Type (welcome greeting)

**HOM · Greeting and practice chips** · must · approved · React Bits (app exception) · DECIDED: rebuild with motion; no GSAP in the app. · [link](https://reactbits.dev/c/text-animations/text-type)

The greeting types itself out the first time the clinician opens the app each day: "Good morning, Dana" / "Good afternoon, Dana" / "Good evening, Dana" by time of day, "Welcome, Dana" on the very first visit after onboarding, and "Welcome back, Dana" after a few days away. Types once and stops (loop off, no deletes, no fake typos), with the cursor fading out at the end. Every later visit that day shows the greeting already written, no animation (remember the last-greeted date on the device). Replaces today's "Hi, Dana" heading on Home. Pairs with the opening moments: Liquid Ether background (UI-018) and Liquid Aeon splashing in (UI-017). Accessibility: the heading keeps its full text for screen readers (the component hides the typed letters from them); reduced motion shows the full greeting at once. Colors: text in ink #17142B (dark #F1EEFF), cursor in accent #5B47C9 (dark #8E7CF8), the name may be accent via textColors. Install: npx shadcn@latest add @react-bits/TextType-TS-TW. The original needs GSAP; DECIDED: no GSAP in the app, so rebuild this small effect with motion.

### UI-020 Card Nav (menu that opens into cards)

**SHL · Phone top bar and menu** · must · approved · React Bits (app exception) · [link](https://reactbits.dev/c/components/card-nav)

A glass top bar (Aeon orb as the logo, menu button, optional action button) that opens downward into cards, each card a group of links. Isaiah loves the feel. Main spot: the phone navigation, replacing today's plain phone top bar and menu (the sidebar already becomes a top bar under 768px). Suggested cards: My practice (Home, Approvals, Deadlines), Grow (Referrals, Instagram), Front Desk (Inquiries, Web chat), Settings (Auto-approve, Connections). Desktop keeps the 240px left sidebar unless the review decides to try Card Nav there too. Also the natural header for a public landing page. Use surface glass, theme light (dark follows dark mode). Colors from the Caseload palette: bar = glass white 64% with 18px blur, cards = white/#121022, text = ink #17142B (dark #F1EEFF), accent = #5B47C9 (dark #8E7CF8), action button = primary pill #1E1A3A. Keep links 44px tall. Install: npx shadcn@latest add @react-bits/CardNav-TS-TW. No motion dependency; swap Hugeicons for lucide. Keyboard support (aria-expanded/controls), respects reduced motion.

### UI-021 Dock (Mac-style magnifying dock)

**TBD · Anywhere it fits** · nice · parked · React Bits (reference) · [link](https://reactbits.dev/c/components/dock?baseItemSize=38&distance=160&magnification=56&panelHeight=50&feel=snappy&bounce=false&showIndicators=false)

Reference only for now: Isaiah may want a dock one day. A Mac-style bar of icons that grow as the pointer passes over them, with badges and menus. His chosen settings (keep these if it's used): base icon 38px, magnification 56px, distance 160, panel height 50, feel snappy, bounce off, indicators off. Possible future spots: a quick-actions dock for the helpers (Front Desk, Referrals, Instagram, Admin) with badges for waiting items, or a landing page. Note for later: icons under 44px fail the touch-target rule on phones, so a dock would be desktop only. Colors would follow the Caseload palette (glass panel, accent #5B47C9, badges in status colors). Install: npx shadcn@latest add @react-bits/Dock-TS-TW. No animation library needed; keyboard toolbar with menus; respects reduced motion.

### UI-022 Stepper (onboarding steps)

**ONB · Step list** · must · approved · React Bits (app exception) · [link](https://reactbits.dev/c/components/stepper)

The step-by-step frame for the beginning of onboarding. Matches the AGENTS.md onboarding layout: vertical orientation as the step list inside the 340px glass panel on the left (under Aeon's orb and speech bubble), with each step's content on the right. Suggested steps (confirm when onboarding is built): Meet Aeon, Who you help (Chip selectors UI-003), How you work, Practice stage (beginning / middle / late), Aeon puts it together (Thought Line UI-014 + Liquid Aeon UI-017), Meet your team. Settings: linear on (finish steps in order; completed steps can be revisited), Continue disabled until the step is answered (nextButtonProps), theme light, indicator numbers or checks, slide transition. Buttons are Caseload pills: Continue = primary #1E1A3A 52px, Back = quiet chip-off pill; final button says what happens ("Finish setup"), not "Complete". Phone (390 wide): horizontal compact step dots at the top and the Continue button pinned to the bottom (UI-009). Colors: accent #5B47C9 for the current step, success #2F7A55 for done steps, border #D4CDF0 for upcoming (dark: #8E7CF8 / #8FD8AE / white 16%). Install: npx shadcn@latest add @react-bits/Stepper-TS-TW. No motion dependency; swap Hugeicons for lucide. Announces step changes (aria-live, aria-current); respects reduced motion.

### UI-023 Attachment (file and image cards)

**IGM · Post composer** · must · approved · shadcn/ui (MIT) · [link](https://ui.shadcn.com/docs/components/base/attachment)

Cards that show an image or file with a preview, name, details and small actions (remove, open), in a scrolling row. States: uploading, processing, error, done (title shimmers while working; errors say why in words). Main spot: the Instagram post composer, for the post's image and any inspiration photos: generating with muse-image (processing), converting to JPEG with sharp (processing), ready (done) or failed with the reason (error, e.g. "Blocked: mentions self-harm" per the posting rules). Also reuse it for files added in the Chat with Aeon panel (Prompt Bar UI-011 has an attachments slot) and payer PDF forms in credentialing prep, so files look the same everywhere. Give icon-only actions labels like "Remove first-session.jpg". Colors via shadcn's CSS variables mapped to the Caseload palette: card = glass white / #121022, border #D4CDF0, text ink #17142B and muted #5D5878, error = #A1261B, radius 20px. Install: npx shadcn@latest add attachment. First shadcn component in the app: needs a one-time shadcn setup (components.json, cn helper, Button) on Base UI, which every shadcn piece uses (decided at review). License: shadcn/ui is MIT. Not React Bits, so no pipeline exception needed.

### UI-024 Library page (file manager layout)

**LIB · Whole page** · must · approved · Screenshot (React Bits Pro demo, layout reference only)

A new page where the clinician finds everything Practice-OS has made or stored for her, any time she needs it. Layout from Isaiah's screenshot (a React Bits Pro demo; we do NOT have or copy its code; we build our own from free parts): breadcrumb trail; title with counts (folders, files, total size); filter tabs All / Images / Documents / Audio; a sort button (Name, Date added, Type); a row of folder cards; a grid of file cards with preview, name, type and size; select files to bring up a bottom action bar ("2 selected" with Download, Delete, More, and close). Folders for our content: Instagram posts (generated images and captions), Referral letters (drafts), Forms and PDFs (Good Faith Estimates, credentialing packets, payer forms), Voicemails (recordings and transcripts), Brand (headshot, cut-out, logo). Built from: shadcn/ui Breadcrumb, Tabs, Dropdown Menu and Button; Attachment cards (UI-023) for files with their states; Spring Check (UI-013) or a checkbox for selecting; the selection bar slides up (motion). Caseload look, light by default: glass cards on the lilac background (the screenshot is dark; dark mode follows the device), file tiles white 64% glass with radius 20px, selected tiles get an accent #5B47C9 ring, the action bar is the dark primary #1E1A3A with white text, Delete in #A1261B and asks to confirm. All sample files labeled [Sample]. Keyboard: tiles focusable, Space selects, Escape clears the selection.

### UI-025 Front Desk work queue (list plus schedule panel)

**FDK · Inquiries list** · must · approved · Screenshot (React Bits Pro demo, layout reference only)

Front Desk page layout from Isaiah's screenshot (a React Bits Pro demo; we do NOT have or copy its code; we build our own from free parts). Middle: the inquiries list as a table: who (name or number), how they reached out (voicemail, text, web chat), status (New, Options sent, Booked, Needs you, Closed) with Status Mark (UI-010), and the consult date. Filter buttons on top: All, Needs you, Waiting on caller, Booked; plus a "Text a caller" button that queues an approval, never sends directly. Long names truncate with "…". Right panel (can be closed): the consult schedule: month calendar with a dot on days that have booked consults (today highlighted), and an "Up next" list of upcoming consults from Cal.com (date and time, name, consult type). Crisis alerts are never just a row in the list: they sit pinned at the top in the danger color until acknowledged (HB 1806 safety rule). Status words describe logistics only, never a caller's mood. Bonus for the app shell: counts beside sidebar items like the screenshot's "Story queue 16" (e.g. Approvals 5, Front Desk 2 new). Caseload look, light by default: the list and the panel are glass cards on the lilac background, rows 56px tall with hairline dividers, "Needs you" in the pending amber, active filter as the dark chip-on pill, today in the calendar as an accent #5B47C9 circle. Built from shadcn/ui Table, Calendar, Toggle group and Sheet (the panel). All sample callers labeled [Sample] with 555 numbers.

### UI-026 Chat-first home (the app opens on Aeon)

**HOM · Opening view (whole page)** · must · approved · Screenshot (layout reference only) · DECIDED 2026-10-26: chat-first home; the dashboard (and a Kanban-style board) is reached from the sidebar. AGENTS.md to be updated.

How the app opens and feels, from Isaiah's screenshot (layout reference only; we build our own). The home is a conversation with Aeon. Center: Aeon's liquid orb (UI-017), the typed greeting (UI-019) ending in "How can I help?", a line like "Start typing, or pick one of these to get going.", the Prompt Bar (UI-011) with + attach and Voice Pill dictation (UI-015), and four suggestion tiles for practice tasks: "What's due this month?", "Draft a referral letter", "Plan this week's posts", "Who called today?". Left sidebar: New chat button (primary pill); "Talk to" picker replacing the screenshot's model picker: Aeon, Front Desk, Referrals, Instagram as tiles with their colored orbs; Pinned and Recent conversations (dark chat menu UI-005); Quick actions with counts (Approvals 5, Deadlines 2, Front Desk 2 new, Library); the clinician at the bottom (Dana Reyes, LCPC). Top bar: who you're talking to, chat title, Share chat optional. Footer: "Aeon can make mistakes. Check anything important. Aeon handles practice logistics, not clinical advice." DECIDED (2026-10-26): chat-first home; the dashboard and a Kanban-style board are reached from the sidebar. Suggested blend: "Waiting for you" approvals and the morning brief as cards under the message box. Caseload look: light lilac with glass cards (the screenshot is dark; dark mode follows the device), primary pills, Inter. AGENTS.md is updated to match.

### UI-027 Approval card in the chat

**CHT · Approval card in chat** · must · approved · Screenshot (layout reference only)

From Isaiah's screenshot (layout reference only; we build our own). When Aeon wants to send, post or book something during a conversation, the chat shows: (1) Aeon's plain-English explanation of what and why; (2) small "what Aeon checked" lines with a check and the time taken, written in plain words for a non-technical clinician ("Checked open consult times · 0.8s"), not code names like list_projects; (3) an approval card: a "Needs approval" pill (pending amber), a one-line title of what will happen ("Text Sam Example your consult options"), a details box (who it goes to, what it says, what it won't touch, whether it can be undone), an expandable "Show request" with the exact draft, and two buttons: Decline (quiet pill) and a primary pill that names the action ("Send text", "Save as Gmail draft", "Publish post", "Book consult"), never a generic "Approve". This card IS the same row as the approvals inbox: it is created through queue_approval / the approvals table, the buttons call the same approve and decline routes, and its status updates live in both places (Status Mark UI-010: pending, running, done, failed, declined; failed shows the reason). Edit then approve opens the draft inline. For weighty outside-world actions the action button can be Slide to Commit (UI-012). Every decision is written to audit_log. Caseload look: glass card on the lilac chat background, radius 20px, details box slightly darker glass, light by default (screenshot is dark). Pairs with the cut-corner chat bubbles (UI-006) and Thought Line (UI-014).

### UI-028 Confirm dialog for permanent actions (Alert Dialog)

**GLB · Confirm dialogs** · must · approved · shadcn/ui (MIT); coss ui reference only (AGPL) · [link](https://coss.com/ui/docs/components/alert-dialog)

The "Are you sure?" box for anything permanent or risky, so a stray click can't do damage. Use it for: deleting the practice's data / account (if the app gets that option), deleting files in the Library (UI-024), disconnecting Instagram or Gmail, cancelling a booked consult, turning on auto-approve for a kind of action in Settings, and resetting demo data. Not for approvals (those use the approval card UI-027). Shape: a title that names the action ("Delete 3 files?"), one or two plain sentences on what happens and whether it can be undone, then two buttons: Cancel (quiet pill, gets focus first) and a danger pill that repeats the action ("Delete 3 files"), never "OK" or "Yes". For the most serious one (deleting all practice data), also ask her to type the practice name before the button unlocks. On phones it sits at the bottom of the screen. Keyboard: focus stays inside, Escape cancels. Every confirmed action is written to audit_log. Caseload look: glass panel (white 82%) on a dimmed backdrop, radius 24px, danger pill #A1261B (dark #FFAEA3 text on a dark red tint). SOURCE DECISION: Isaiah linked coss ui (coss.com/ui, Cal.com's library), but its code is AGPL-3.0 (checked the GitHub repo), which could force the whole public repo under AGPL. Use shadcn/ui's Alert Dialog instead (MIT, same job, same underlying primitives); keep coss as a visual reference only. Install: npx shadcn@latest add alert-dialog.

### UI-029 Avatar (profile picture)

**SHL · Profile (bottom of sidebar)** · must · approved · shadcn/ui (MIT); coss ui reference only (AGPL) · [link](https://coss.com/ui/docs/components/avatar)

The clinician's round profile picture, with her initials as a fallback while it loads or if there's no photo. Main spot: the bottom of the sidebar (name, credential and picture, like the chat-first screenshot UI-026), which opens her profile and settings. Also: Settings > Practice details (change picture), the clinician's own chat bubbles in Chat with Aeon if shown, and the "Meet the clinician" Instagram post preview. For the demo, Dana's picture is the headshot generated with muse-image-1.0 (never a stock or real photo, per AGENTS.md); fallback initials "DR". Callers and referral contacts get initials only (no photos), in soft Caseload tints. Sizes: 32px (lists), 40px (sidebar), 72px (settings). Caseload look: circle with a 2px white hairline ring, fallback = lilac #E2D8FF with accent #5B47C9 initials (dark: #8E7CF8 tint, #F1EEFF initials); optional small status dot in success #2F7A55. Alt text = the person's name. SOURCE DECISION: Isaiah linked coss ui's Avatar, but coss ui is AGPL-3.0; use shadcn/ui's Avatar instead (MIT, same parts: image + fallback) and keep coss as a visual reference. Install: npx shadcn@latest add avatar.

### UI-030 Calendar (shared month calendar)

**DLN · Calendar** · must · approved · shadcn/ui (MIT); coss ui reference only (AGPL) · [link](https://coss.com/ui/docs/components/calendar)

One month calendar used everywhere dates matter, so dates look the same across the app. Main spot: Deadlines, with a small dot on days that have a deadline (license renewal, CE, CAQH, PLLC report, quarterly tax); click a day to see what's due. Also: the Front Desk schedule panel (UI-025) with dots on days with booked consults; the Instagram content calendar (planned and published posts); and as a date picker in forms (snooze a deadline, pick a post date). Weeks start on Sunday (US), today circled in accent #5B47C9, the selected day as the dark primary pill #1E1A3A, days from other months muted #5D5878, dots in the matching status color (deadline amber, consult accent, done green), at least 40px per day cell (44px on phones). Arrow-key navigation and screen-reader labels per day ("Tuesday, March 31, 2027: license renewal due"). Caseload look: sits inside a glass card, no border of its own; dark mode follows the device. SOURCE DECISION: Isaiah linked coss ui's Calendar; coss ui is AGPL-3.0, so use shadcn/ui's Calendar instead (MIT, built on react-day-picker) and keep coss as a visual reference. Install: npx shadcn@latest add calendar.

### UI-031 Toast notifications

**GLB · Toasts** · must · approved · shadcn/ui (MIT) · added at review · [link](https://ui.shadcn.com/docs/components/sonner)

Small messages that pop up in a corner and fade, confirming what just happened or saying what went wrong: "Text sent to Sam Example", "Post published", "Saved as a Gmail draft", "Couldn't reach Gmail. Reconnect it in Settings." Used across every screen after an approval runs, a setting changes, or a connection fails. Success messages fade on their own; errors stay until dismissed and name the fix. Announced to screen readers. Caseload look: glass toast, radius 20px, Status Mark (UI-010) icon on the left, bottom-right on desktop, top on phones. Install: npx shadcn@latest add sonner (shadcn/ui, MIT). Added at the review because every screen needs it.

### UI-032 Settings controls (switches and selects)

**SET · Auto-approve kinds** · must · approved · shadcn/ui (MIT) · added at review · [link](https://ui.shadcn.com/docs/components/switch)

The standard controls for Settings and forms: on/off switches (e.g. auto-approve "Text callers their consult options"), dropdown selects, radio choices and text inputs as 48px pills. Turning ON an auto-approve switch asks first with the Confirm dialog (UI-028) because it lets Aeon act without asking. Labels in plain words with a one-line explanation under each. Caseload look: switch track border #D4CDF0, on = accent #5B47C9 (dark #8E7CF8), 44px touch targets, visible focus ring. Install: npx shadcn@latest add switch select radio-group input (shadcn/ui, MIT, Base UI). Added at the review because every screen needs it.
