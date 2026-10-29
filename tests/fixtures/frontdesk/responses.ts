// Provider responses for the Front Desk adapter tests. Fake data only.
// Shapes copied from each provider's API reference (checked 2026-10-28):
// Twilio 2010-04-01 REST, Spruce v1 (developer.sprucehealth.com), Cal.com v2
// (cal-api-version per endpoint), Google Calendar v3. Re-record from a live
// sandbox account when one is connected; field names must not drift.

export const twilio = {
  numbers: { incoming_phone_numbers: [{ sid: "PN_fake", phone_number: "+13125550100" }] },
  recordings: {
    recordings: [
      { sid: "RE_fake_new", call_sid: "CA_fake_1", date_created: "Wed, 28 Oct 2026 21:12:00 +0000", status: "completed", duration: "18" },
      { sid: "RE_fake_old", call_sid: "CA_fake_2", date_created: "Mon, 26 Oct 2026 15:00:00 +0000", status: "completed", duration: "9" },
      { sid: "RE_fake_busy", call_sid: "CA_fake_3", date_created: "Wed, 28 Oct 2026 21:13:00 +0000", status: "processing", duration: "-1" },
    ],
  },
  call1: { sid: "CA_fake_1", from: "+13125550144", to: "+13125550100" },
  messages: {
    messages: [
      { sid: "SM_fake_in", from: "+13125550144", to: "+13125550100", body: "2", direction: "inbound", date_sent: "Wed, 28 Oct 2026 21:20:00 +0000", date_created: "Wed, 28 Oct 2026 21:20:00 +0000" },
      { sid: "SM_fake_out", from: "+13125550100", to: "+13125550144", body: "Open consult times...", direction: "outbound-api", date_sent: "Wed, 28 Oct 2026 21:15:00 +0000", date_created: "Wed, 28 Oct 2026 21:15:00 +0000" },
    ],
  },
  sent: { sid: "SM_fake_sent" },
};

const endpoint = (rawValue: string, internal = false) => ({
  id: internal ? "ep_line" : "ep_caller",
  channel: "phone",
  displayValue: "(312) 555-0144",
  rawValue,
  isInternal: internal,
  object: "endpoint",
});

export const spruce = {
  internalEndpoints: { internalEndpoints: [{ object: "internalEndpoint", endpoint: { ...endpoint("+13125550100", true), displayValue: "(312) 555-0100" }, owner: { id: "org_1", name: "[Sample] Reyes Counseling", type: "organization", object: "organization" } }] },
  conversations: {
    conversations: [
      { id: "t_phone", object: "conversation", title: "(312) 555-0144", type: "phone", archived: false, createdAt: "2026-10-28T21:00:00Z", lastMessageAt: "2026-10-28T21:20:00Z", isReadOnly: false, tags: [], externalParticipants: [{ displayName: "(312) 555-0144", endpoint: endpoint("+13125550144") }] },
      { id: "t_secure", object: "conversation", title: "Secure", type: "secure", archived: false, createdAt: "2026-10-28T21:00:00Z", isReadOnly: false, tags: [] },
    ],
    hasMore: false,
    paginationToken: "",
    totalCount: 2,
  },
  items: {
    conversationItems: [
      {
        id: "ti_vm", conversationId: "t_phone", object: "conversationItem", direction: "inbound", isInternalNote: false, canDelete: false, text: "",
        createdAt: "2026-10-28T21:12:00Z", modifiedAt: "2026-10-28T21:12:00Z", author: { displayName: "(312) 555-0144" }, attachments: [], buttons: [], pages: [],
        event: { type: "inboundCall", data: { answered: false, failed: false, spam: false, duration: 18, recordings: [], voicemail: { title: "Voicemail", type: "audio", data: { mimetype: "audio/mpeg", signedUrl: { url: "https://media.example.test/vm.mp3", expiresAt: "2026-10-28T22:12:00Z" }, transcription: { id: "tr_1", status: "completed", summarizationStatus: null } } } } },
      },
      {
        id: "ti_sms", conversationId: "t_phone", object: "conversationItem", direction: "inbound", isInternalNote: false, canDelete: false, text: "2",
        createdAt: "2026-10-28T21:20:00Z", modifiedAt: "2026-10-28T21:20:00Z", author: { displayName: "(312) 555-0144" }, attachments: [], buttons: [], pages: [],
      },
      {
        id: "ti_note", conversationId: "t_phone", object: "conversationItem", direction: "none", isInternalNote: true, canDelete: true, text: "internal",
        createdAt: "2026-10-28T21:21:00Z", modifiedAt: "2026-10-28T21:21:00Z", author: { displayName: "Dana" }, attachments: [], buttons: [], pages: [],
      },
    ],
    hasMore: false,
    paginationToken: "",
    totalCount: 3,
  },
  transcription: { transcription: { id: "tr_1", status: "completed", text: "Hi, it's Sam, I'd like to set up a first appointment." } },
  sent: { requestId: "asyncRequest_fake" },
};

export const calcom = {
  eventTypes: { status: "success", data: [{ id: 42, title: "[Sample] Free phone consult", slug: "consult", lengthInMinutes: 15 }] },
  slots: {
    status: "success",
    data: {
      "2026-11-03": [{ start: "2026-11-03T10:00:00.000-06:00", end: "2026-11-03T10:15:00.000-06:00" }],
      "2026-11-04": [
        { start: "2026-11-04T14:00:00.000-06:00", end: "2026-11-04T14:15:00.000-06:00" },
        { start: "2026-11-04T15:00:00.000-06:00", end: "2026-11-04T15:15:00.000-06:00" },
      ],
    },
  },
  booking: { status: "success", data: { id: 7, uid: "bk_fake_1", start: "2026-11-04T20:00:00Z", end: "2026-11-04T20:15:00Z", status: "accepted" } },
  rescheduled: { status: "success", data: { id: 8, uid: "bk_fake_2", start: "2026-11-05T20:00:00Z", end: "2026-11-05T20:15:00Z", status: "accepted" } },
  cancelled: { status: "success", data: { id: 8, uid: "bk_fake_2", status: "cancelled" } },
};

export const google = {
  freeBusy: {
    kind: "calendar#freeBusy",
    timeMin: "2026-11-02T15:00:00Z",
    timeMax: "2026-11-03T23:00:00Z",
    calendars: { primary: { busy: [{ start: "2026-11-03T15:00:00Z", end: "2026-11-03T17:00:00Z" }] } },
  },
  event: { kind: "calendar#event", id: "practiceosfd1042x", status: "confirmed", summary: "Phone consult FD-1042" },
};
