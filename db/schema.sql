-- Hiring dashboard schema + Kargo rubric seed (Postgres / Neon).
-- Only the server connects (DATABASE_URL); nothing is exposed to the browser.

-- ---------------------------------------------------------------- roles & rubric
create table roles (
  code  text primary key,          -- 'PM' | 'SPM'
  title text not null,
  jd    text not null default ''   -- job description, used as context for briefs and emails (not scoring)
);

create table rubric_criteria (
  id          uuid primary key default gen_random_uuid(),
  role_code   text not null references roles(code),
  key         text not null,        -- stable id used in the scoring schema
  position    int  not null,
  name        text not null,
  weight      numeric(4,3) not null check (weight > 0 and weight <= 1),
  level_1     text not null,        -- Absent
  level_2     text not null,        -- Weak
  level_3     text not null,        -- Present
  level_4     text not null,        -- Strong
  unique (role_code, key)
);

-- ---------------------------------------------------------------- candidates
create table candidates (
  id             uuid primary key default gen_random_uuid(),
  applied_role   text not null references roles(code),
  file_name      text not null,
  cv_text        text not null,      -- REDACTED CV text: the only CV content that reaches the AI
  status         text not null default 'pending'
                   check (status in ('pending','processing','scored','error')),
  error          text,
  brief          text,               -- 3-sentence interview brief (top N per role only)
  email_kind     text check (email_kind in ('invite','reject')),
  email_subject  text,
  email_body     text,               -- template; contains {{first_name}}, never the real name
  email_override text,               -- founder's hand-edited final body (optional)
  email_sent_at  timestamptz,
  email_error    text,
  resend_id      text,
  created_at     timestamptz not null default now()
);

-- Personal details, stored apart from everything else. Never read by any AI step.
create table candidate_pii (
  candidate_id uuid primary key references candidates(id) on delete cascade,
  full_name    text not null,
  email        text,
  phone        text
);

create table criterion_scores (
  candidate_id uuid not null references candidates(id) on delete cascade,
  criterion_id uuid not null references rubric_criteria(id),
  score        int  not null check (score between 1 and 4),
  reason       text not null,
  primary key (candidate_id, criterion_id)
);

-- Weighted score per candidate per role (1.00 - 4.00). Every candidate gets both PM and SPM.
create table role_scores (
  candidate_id   uuid not null references candidates(id) on delete cascade,
  role_code      text not null references roles(code),
  weighted_score numeric(4,2) not null,
  primary key (candidate_id, role_code)
);

create table settings (
  id               int primary key default 1 check (id = 1),
  invite_threshold numeric(3,2) not null default 3.00,  -- applied-role score >= this gets an invite
  top_n            int not null default 5,              -- briefs for the top N per role
  company_name     text not null default 'Kargo',
  sender_name      text not null default 'Arjun Mehta',
  invite_next_step text not null default 'Reply to this email with two or three times that suit you next week and we will send a calendar invite.'
);

-- ---------------------------------------------------------------- seed
insert into settings (id) values (1);

insert into roles (code, title) values
  ('PM',  'Product Manager'),
  ('SPM', 'Senior Product Manager');

insert into rubric_criteria (role_code, key, position, name, weight, level_1, level_2, level_3, level_4) values
-- PRODUCT MANAGER ------------------------------------------------------------
('PM', 'unprompted_build', 1, 'Unprompted build, adopted by others', 0.35,
 'No mention of building or fixing anything that wasn''t assigned.',
 'Improved something, but only people already on their team used it — no outside adoption named.',
 'Names something built unprompted that others used, but no headcount or timeframe given.',
 'Names the exact thing built, the exact number of people who adopted it, and the timeframe — like "30 colleagues... within the first month."'),
('PM', 'two_audiences', 2, 'Same knowledge, written for two audiences', 0.25,
 'No writing or documentation mentioned at all.',
 'Mentions writing docs, but for one audience only (e.g., just their own team).',
 'Names a document written for a second audience (engineering, customers), but doesn''t describe both versions.',
 'Names two distinct write-ups from the same underlying event/knowledge, for two clearly different audiences — e.g., an internal version and a customer-facing version of the same post-mortem.'),
('PM', 'high_pressure', 3, 'One named high-pressure call, resolved cleanly', 0.20,
 'No specific pressured event named — only ongoing responsibilities.',
 'A stressful period is mentioned, but no single decision or clean resolution is stated.',
 'Names one high-pressure event and says it was resolved, but without a concrete result attached.',
 'Names the event, states it was under time pressure, and gives a concrete, closed-out result — e.g., "completed under time pressure with no data loss."'),
('PM', 'adoption_precision', 4, 'Precision when claiming adoption', 0.20,
 'No adoption claims made.',
 'Adoption is claimed in vague terms ("well received," "the team liked it").',
 'A number is given, but no timeframe (or vice versa).',
 'Both an exact number and a specific timeframe are given together.'),
-- SENIOR PRODUCT MANAGER -----------------------------------------------------
('SPM', 'unprompted_build', 1, 'Unprompted build, adopted by others', 0.25,
 'No mention of building or fixing anything that wasn''t assigned.',
 'Something was built and adopted, but stayed inside their own team.',
 'Adoption happened outside their immediate team, but scale/timeframe is vague.',
 'Adoption is named as crossing into a different function, account set, or customer group entirely — not just their own desk neighbors — with a number and timeframe.'),
('SPM', 'two_audiences', 2, 'Same knowledge, written for two audiences', 0.20,
 'No writing or documentation mentioned.',
 'Documentation exists but both "audiences" are really the same internal group.',
 'Two audiences are named, but the difference in what each needed from the document isn''t described.',
 'Two audiences with materially different needs are both named, and the write-up is shown adapting to each — e.g., a technical spec vs. the same incident explained to a customer.'),
('SPM', 'high_pressure_alone', 3, 'One named high-pressure call, made alone, resolved cleanly', 0.35,
 'No specific pressured event named, or decisions are described as made by a manager/committee.',
 'An event is named, but it''s unclear whether the candidate decided alone or was told what to do.',
 'The candidate clearly made the call alone, but the resolution is vague or still ongoing.',
 'The candidate made the call alone under real pressure, and states a concrete, closed-out result — no mention of a manager or committee involved in the decision itself.'),
('SPM', 'adoption_precision', 4, 'Precision when claiming adoption', 0.20,
 'No adoption claims made.',
 'Adoption claimed in vague terms only.',
 'A number or a timeframe is given, not both.',
 'Both a specific number and a specific timeframe are given together.');

-- Sanity check: each role's weights sum to 1.
do $$
begin
  if exists (select 1 from rubric_criteria group by role_code having sum(weight) <> 1) then
    raise exception 'rubric weights do not sum to 1 for every role';
  end if;
end $$;
