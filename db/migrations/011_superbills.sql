-- 011: superbills she gives a self-pay or out-of-network client, saved by reference.
--
-- A row holds only the practice side of a superbill: dates of service, CPT codes,
-- modifiers, units, fees, place of service, diagnosis POINTER letters (A-D) and
-- what was paid. There is no column for a client's name, birth date, address,
-- phone, email or diagnosis code. Those go only into the PDF's blank fillable
-- boxes, which she completes on her own computer; Practice-OS never sees them.
-- No approval kind: Aeon never sends a superbill. She marks it given (issued_on).
-- Field map to the CMS-1500 (NUCC manual v13): docs/research.md.

create sequence practice_os.superbill_number_seq;

create table practice_os.superbills (
  id uuid primary key default gen_random_uuid(),
  -- What she matches against her own client records, e.g. SB-2026-0001.
  reference text not null unique
    default ('SB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('practice_os.superbill_number_seq')::text, 4, '0')),
  -- [{"date_of_service": "2026-10-06", "cpt": "90837", "modifier": "95", "units": 1,
  --   "cents": 17500, "pos": "10", "dx_pointers": ["A"]}]
  lines jsonb not null check (
    jsonb_typeof(lines) = 'array'
    and jsonb_array_length(lines) between 1 and 31
    -- Only these keys, so nothing else (a name, a note) can be stored in a line.
    and not jsonb_path_exists(lines,
      '$[*].keyvalue() ? (!(@.key like_regex "^(date_of_service|cpt|modifier|units|cents|pos|dx_pointers)$"))')
  ),
  total_cents integer not null check (total_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0 and paid_cents <= total_cents),
  -- Set when she presses "Mark given".
  issued_on date,
  created_by text not null check (length(created_by) between 1 and 120),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index superbills_created_idx on practice_os.superbills (created_at desc);

create trigger superbills_touch_updated_at before update on practice_os.superbills
  for each row execute function practice_os.touch_updated_at();
alter table practice_os.superbills enable row level security;
