-- Arjun's decision is separate from the AI's suggestion. Nothing is sent until he decides.
alter table candidates add column if not exists decision text not null default 'pending';
do $$ begin
  alter table candidates add constraint candidates_decision_check check (decision in ('pending','invite','reject'));
exception when duplicate_object then null; end $$;
alter table candidates add column if not exists decided_at timestamptz;

create table if not exists interviews (
  candidate_id     uuid primary key references candidates(id) on delete cascade,
  status           text not null default 'to_schedule' check (status in ('to_schedule','scheduled','done','no_show')),
  scheduled_at     timestamptz,
  mode             text not null default 'In person, Mumbai office',
  recording_url    text,            -- external link (Drive / Zoom / Loom) or private Blob URL
  recording_name   text,
  recording_is_blob boolean not null default false,
  notes            text not null default '',
  rating           int check (rating between 1 and 5),
  scorecard        jsonb not null default '{}'::jsonb,   -- { criterion_id: 1..4 } Arjun's post-interview scores
  outcome          text not null default 'pending' check (outcome in ('pending','next_round','hire','no_hire')),
  followup_kind    text,
  followup_subject text,
  followup_body    text,            -- template with {{first_name}}
  followup_sent_at timestamptz,
  followup_error   text,
  updated_at       timestamptz not null default now()
);
