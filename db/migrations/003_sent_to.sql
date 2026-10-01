-- Who an email actually went to (the candidate, or the founder's inbox in test mode).
alter table candidates add column if not exists email_sent_to text;
alter table interviews add column if not exists followup_sent_to text;
