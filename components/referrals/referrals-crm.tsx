"use client";

// The Referrals page (a calm CRM): the title with Find partners and Add partner, four
// numbers, tabs (Partners, Overview, Board, Calendar, Map, Meetings and notes) kept in
// the URL as ?tab=, and the Ask Aeon box pinned under every tab.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { SideSheet } from "@/components/shared/side-sheet";
import { Tab, TabList, TabPanel, Tabs } from "@/components/shared/tabs";
import { Button, PageHeader } from "@/components/ui";
import type { ReferralCounts } from "@/lib/referrals/crm";
import type { SpecialtyId } from "@/lib/referrals/nppes";
import { REFERRAL_TABS, type ReferralTab } from "@/lib/referrals/tabs";
import { AddYourself, type TypeOption } from "./add-yourself";
import { AreaExplorer, type BoardEntry } from "./area-explorer";
import { AskAeonBar } from "./ask-aeon-bar";
import { PartnersTab, type PartnersData } from "./partners-tab";
import { PlaceFinder, type PlaceKind } from "./place-finder";
import { BoardTab } from "./tabs/board-tab";
import { CalendarTab } from "./tabs/calendar-tab";
import { MapTab } from "./tabs/map-tab";
import { MeetingsTab } from "./tabs/meetings-tab";
import { OverviewTab } from "./tabs/overview-tab";

export type FinderProps = {
  defaultArea: string;
  specialties: SpecialtyId[];
  board: Record<string, BoardEntry>;
  placeKinds: PlaceKind[];
  defaultKinds: string[];
  types: TypeOption[];
};

/** Writes the tab (and the partner picked for the calendar) into the address bar without a reload. */
function writeUrl(tab: ReferralTab, partner: string | null) {
  const url = new URL(window.location.href);
  for (const k of ["tab", "partner", "debrief"]) url.searchParams.delete(k);
  if (tab !== "partners") url.searchParams.set("tab", tab);
  if (partner) url.searchParams.set("partner", partner);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export function ReferralsCrm({
  initialTab,
  initialOpen,
  initialCalendarPartner,
  counts,
  partners,
  finder,
}: {
  initialTab: ReferralTab;
  /** /referrals?partner=<id> or ?debrief=<id> (the chat's debrief card): that partner's panel opens. */
  initialOpen: { id: string; debrief: boolean } | null;
  initialCalendarPartner: string | null;
  counts: ReferralCounts;
  partners: PartnersData;
  finder: FinderProps;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ReferralTab>(initialTab);
  const [open, setOpen] = useState(initialOpen);
  const [calendarPartner, setCalendarPartner] = useState(initialCalendarPartner);
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [sheet, setSheet] = useState<"find" | "add" | null>(null);

  function go(next: ReferralTab, partner: string | null = null) {
    setTab(next);
    setCalendarPartner(next === "calendar" ? partner : null);
    writeUrl(next, next === "calendar" ? partner : null);
  }

  const tiles: { label: string; value: number; hint: string }[] = [
    { label: "Partners", value: counts.partners, hint: "On your board" },
    { label: "Reach out this week", value: counts.reachOut, hint: "From your weekly plan" },
    { label: "Waiting on you", value: counts.waiting, hint: "Letters in Approvals" },
    { label: "Referrals this month", value: counts.referredThisMonth, hint: "Last 30 days" },
  ];
  const tabLabel = REFERRAL_TABS.find((t) => t.id === tab)!.label;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Referrals"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" onClick={() => setSheet("find")}>
              <Search aria-hidden size={16} />
              Find partners
            </Button>
            <Button variant="accent" onClick={() => setSheet("add")}>
              <Plus aria-hidden size={16} />
              Add partner
            </Button>
          </div>
        }
      />

      <section aria-label="Referral numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-4">
            <p className="text-small font-medium text-[var(--fg-muted)]">{t.label}</p>
            <p className="text-title tabular-nums">{t.value}</p>
            <p className="text-small text-[var(--fg-muted)]">{t.hint}</p>
          </div>
        ))}
      </section>

      <Tabs value={tab} onValueChange={(v) => go(v)} className="gap-5">
        <TabList label="Referrals views">
          {REFERRAL_TABS.map((t) => (
            <Tab key={t.id} value={t.id}>
              {t.label}
            </Tab>
          ))}
        </TabList>
        {/* Partners stays mounted so a search, a filter or a half-typed note survives a look at another tab. */}
        <TabPanel value="partners" keepMounted>
          <PartnersTab
            data={partners}
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) writeUrl(tab, null);
            }}
            onSelectionChange={setPicked}
            onPlanMeeting={(id) => {
              setOpen(null);
              go("calendar", id);
            }}
            onChanged={() => router.refresh()}
            onFindPartners={() => setSheet("find")}
          />
        </TabPanel>
        <TabPanel value="overview">
          <OverviewTab />
        </TabPanel>
        <TabPanel value="board">
          <BoardTab />
        </TabPanel>
        <TabPanel value="calendar">
          <CalendarTab partnerId={calendarPartner} />
        </TabPanel>
        <TabPanel value="map">
          <MapTab />
        </TabPanel>
        <TabPanel value="meetings">
          <MeetingsTab />
        </TabPanel>
      </Tabs>

      <AskAeonBar tab={tabLabel} picked={tab === "partners" ? picked : []} />

      <SideSheet
        open={sheet === "find"}
        onOpenChange={(next) => !next && setSheet(null)}
        title="Find partners"
        description="Doctors and clinicians near you from the free federal NPI Registry, and places from public lists. Add the ones you like."
        width="max-w-[960px]"
      >
        <AreaExplorer defaultArea={finder.defaultArea} specialties={finder.specialties} board={finder.board} />
        <PlaceFinder defaultArea={finder.defaultArea} kinds={finder.placeKinds} defaultKinds={finder.defaultKinds} />
      </SideSheet>
      <SideSheet open={sheet === "add"} onOpenChange={(next) => !next && setSheet(null)} title="Add partner" description="Anyone the searches can't find. Cards you add are marked “Added by you”.">
        <AddYourself types={finder.types} />
      </SideSheet>
    </div>
  );
}
