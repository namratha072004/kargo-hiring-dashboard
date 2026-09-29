# Hiring dashboard

Internal tool: upload CVs → auto-score against the Kargo PM + SPM rubric → interview briefs for the top N → personalised invite/rejection drafts → founder sends each one via Resend.

## Pipeline

1. **Upload** (`/api/upload`, no AI). Text is pulled from the PDF/DOCX. Name, email and phone are guessed by regex and shown for the founder to confirm. They go into `candidate_pii`. The CV is redacted (`[CANDIDATE]`, `[EMAIL]`, `[PHONE]`, `[PROFILE URL]`) and only that redacted text is stored in `candidates.cv_text`.
2. **Score** (`lib/ai.ts#scoreCv`). A single Gemini call (JSON-schema output) scores all 8 criteria (PM + SPM, 1–4, one-line reason each). Weighted scores are computed in code, not by the model.
3. **Email draft**. Applied-role score ≥ invite line → invite, otherwise a warm rejection. Drafts use `{{first_name}}`, and the real name is filled in only when the page is shown or the email is sent.
4. **Briefs** (`lib/pipeline.ts#reconcile`). A three-sentence brief for the top N per applied role. Changing the threshold or N in Settings updates briefs and re-drafts any unsent email whose invite/reject decision flipped.
5. **Send** (`/api/send`). One click per candidate, with a confirm. It's claimed atomically so it can't double-send. Nothing is sent automatically.

## Setup

1. Database (Neon): put `DATABASE_URL` in `.env.local`, then `npm run db:setup`. This creates the tables, seeds the rubric from `db/schema.sql` and loads the JDs from `db/jds/`. It's safe to re-run.
2. Gemini: set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, default `gemini-2.5-pro`).
3. Resend: verify a sending domain and set `RESEND_FROM` to an address on it.
4. Set `APP_PASSWORD`, then `npm run dev`.
5. Deploy: import into Vercel and add the same env vars.

The JDs are context for briefs and emails only. Scoring uses the rubric alone.
