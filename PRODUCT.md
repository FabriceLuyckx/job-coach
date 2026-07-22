# Product

## Register

product

## Platform

web

## Users

Individual job seekers, self-hosted. Each install is single-tenant — one person's
`profile/profile.json` and `config.json`, no accounts, no shared server. The app ships
as a signed-free desktop build (macOS/Windows via Releases) specifically so someone
with no development background can install it and run their own instance; "usable by
non-technical people" is a real constraint on every screen, not an aspiration for a
later phase.

## Product Purpose

Job Coach exists to carry a person's career data through the entire application
process — not just generate one CV once. A structured profile (experience, skills,
preferences) is entered once and reused: to tailor CVs per opening, to draft
cover-letter writing guides, and to filter watched job boards for new matches. Success
isn't measured by how fast a single CV comes out; it's whether the same profile is
still useful and current the *next* time the person applies, months or years later —
history, decisions (accepted/rejected), and generated artifacts all persist locally so
nothing has to be re-entered or re-explained to the AI.

## Positioning

One profile, many tailored outputs. Where a generic AI resume builder makes you refill
a form per job, Job Coach tailors from a single structured source of truth — the same
career data drives every CV, letter, and match judgment, and that data is designed to
outlive any one job search.

## Brand Personality

Calm, trustworthy, reassuring. Job hunting is already an anxious process; the app
should read as a steady hand, not add urgency or noise. This is a tone constraint
first — copy, error/empty states, and how prominently things like deadlines or
rejections are surfaced — layered onto an already-committed bold visual identity (see
Anti-references and DESIGN.md): confident, direct typography is fine, but interactions
and language stay plain-spoken and unhurried rather than loud.

## Anti-references

"Not generic SaaS" is defined **positively** — the drenched Stone sage ground, one
terracotta accent spent purposefully (every action/selection/deadline, not decoration),
and a calm register — not as the absence of radius or depth, and not the old
cream/Bauhaus print system (which itself became a tell). See DESIGN.md.

- **Generic SaaS dashboard** — the explicit slop list: bordered/soft-shadowed **cards**,
  **cream** or near-white grounds, **soft drop-shadows** on resting UI, **side-stripe**
  accents (a coloured left/right border), **glassmorphism**, and **pill badges** stamped
  onto a row's own fields. Job Coach separates depth by tone, renders listings as one
  board, and reads meta as text.
- **Corporate job-board chrome** — LinkedIn/Indeed-style dense blue UI and
  stock-photo emptiness. Job Coach should never read as "another job board."
- **AI-assistant chat-bot look** — chat bubbles, glowing gradient orbs, sparkle
  iconography. The AI is a quiet tool operating on the profile, not a persona the
  user converses with.

## Design Principles

One profile, many outputs — every generated artifact (CV, letter, match verdict)
traces back to the same structured career data; never ask the user to re-enter what
they already told the app.

Built to last years, not one job search — profile data, generation history, and
decisions persist locally and are exportable (Backup & Restore), because a career
profile is meant to outlive any single application season.

Local-first and honest about cost — zero hosting cost, full data privacy by default,
a free local-AI option sits beside the paid one; never obscure what something costs
or where data goes.

Calm under a stressful process — reduce friction, avoid manufactured urgency, keep
autosave/undo forgiving. The interface should lower the emotional cost of applying,
not add to it.

Plain tool, not a persona — the AI does work in the background (filtering, tailoring,
scoring); it is never staged as a chatbot or assistant character.

## Accessibility & Inclusion

WCAG AA baseline: sufficient color contrast (including the terracotta accent and mono
text against the sage grounds — fill vs. text terracotta are separate tokens for this
reason), full keyboard navigation, readable type sizes. No further user-specific
accommodations known at this time.
