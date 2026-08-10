# AI auto-improvement suite — feature ideas (operator request 2026-08-10)

Operator seeds: auto-learn which captions went viral · per-brand knowledge folder with
a guided tutorial · AI watches the video (frames + transcript) to write personalized
captions per video. Goal: beat Metricool & every scheduler on *closing the loop* —
they all stop at "posted"; Publishly learns from what happened after.

All of this is FUTURE (nothing exists in code today). Site placement decided at Gate 3.

## The loop (the differentiator, one sentence)
Every other tool is fire-and-forget. Publishly is post → measure → learn → write
better → post again — per brand, automatically.

## Features, ordered by leverage

1. **Caption Memory (performance learning).** Every post's caption is embedded +
   joined to its analytics snapshot (views, saves, shares, watch-through). Per brand,
   the system builds a living model of what *this* audience rewards: hook patterns,
   length, emoji density, CTA placement, posting hour. New captions are generated
   against that evidence, not generic "viral tips." Weekly digest: "your top hook
   pattern this month," "captions with a question out-performed by 2.1×."

2. **Brand Folder (the knowledge base).** Each brand gets a folder with a guided
   intake tutorial: voice & tone, banned words, product facts, audience persona,
   founder story, past winners, competitor handles. First-run wizard explains what
   each file is for with examples. Everything the AI writes is grounded in this folder
   — so 50 brands stay 50 distinct voices, never one blended mush. (Also the natural
   isolation boundary: one folder per client, exportable when a client leaves.)

3. **Video Understanding.** On upload: sample frames + transcribe audio. The caption
   model sees what actually happens in the video ("the cat knocks the glass off at
   0:07") and writes captions/hooks/first-comments about *that moment*, in the brand's
   voice, per network. No more captions that could belong to any video.

4. **Self-tuning schedule.** Per brand+network, shift posting slots toward the hours
   that historically performed — bounded (never more than ±2h from the planned slot,
   operator can lock slots). Explains itself: "moved to 7:40pm — your last 12 evening
   posts beat morning by 60%."

5. **A/B captions at the fleet level.** With many accounts posting similar content,
   the fleet is a natural experiment: try two hook styles across the fleet, measure,
   promote the winner into Caption Memory. (Compliance framing: multi-brand content
   research, never coordinated identical posting.)

6. **Post-mortem cards.** 48h after each post: one card — what it did vs the brand's
   baseline, one reason it likely over/under-performed, one suggestion applied to the
   next draft. Reads like a coach, not a dashboard.

7. **Recycling with intelligence.** Evergreen winners resurface on a decay curve with
   a *rewritten* caption (Caption Memory + Video Understanding), never verbatim
   repost — keeps accounts fresh and reviewer-safe.

## Services angle (operator: "offer services for businesses growing many profiles")
Productized service tier on top of the API: managed multi-brand ops — brand-folder
setup, isolation architecture (one client never touches another's tokens/data),
planning cadence, monthly performance review. Marketing placement: a "Managed fleets"
row on /for-agencies + contact CTA. No fabricated case studies.

## Honest site placement (pending Gate 3)
A "What's coming" chapter labeled as in development — the loop diagram (post → measure
→ learn → improve) + 3 flagship cards (Caption Memory, Brand Folder, Video
Understanding). No screenshots of nonexistent UI; illustrative diagrams only.
