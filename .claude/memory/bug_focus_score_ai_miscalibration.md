# Bug: AI Focus Score Wildly Miscalibrated (do not fix until instructed)

## Symptom
Team AI Summary shows Bansi with **1/10 focus** despite:
- 100% productive app usage
- No breaks taken
- 1 session of ~70 min

## Root Cause
The rule-based formula (`calcFocusScore`) correctly scores her **10/10**:
- base = productivePercent / 10 = 100/10 = 10
- sessionBonus = 0 (70 min avg ≥ 45 min)
- breakPenalty = 0 (0 breaks)
- Result = 10/10

But the AI (Llama 3.1 8B via Groq) **overrides** the rule-based score and returned 1/10.
That 1/10 was saved to `employee_daily_memory` table and is now shown in the team view.

## Why AI Gave 1/10
Likely causes:
1. LLaMA 3.1 8B is unreliable at precise numerical scoring — can hallucinate extreme values
2. May have penalized low total hours (1h 10m) even though that's not in the scoring criteria
3. May have seen idle_logs events for Bansi and over-weighted them

## Code Locations

**AI score override (no guard):**
`server/routes/reports.js` line ~239:
```js
const aiScore = Number.isInteger(p.focusScore) ? Math.min(10, Math.max(1, p.focusScore)) : focusScore;
// Only clamps to 1–10. No check against rule-based score — AI can swing from 10 to 1.
```

**Memory caching:**
`server/routes/reports.js` `saveMemory()` — saves AI score to `employee_daily_memory.focus_score`.

**Team view reads cached score:**
`server/routes/reports.js` line ~586:
```js
const focus_score = m?.focus_score != null ? m.focus_score : calcFocusScore({...});
// Trusts cached AI score blindly, even if wildly wrong.
```

## Planned Fix (when user says to implement)
Two changes in `server/routes/reports.js`:

1. **`buildAiSummary`**: clamp AI score to ±3 of rule-based so AI can refine but not wildly override:
```js
const aiScore = Number.isInteger(p.focusScore)
  ? Math.min(10, Math.max(1, Math.min(focusScore + 3, Math.max(focusScore - 3, p.focusScore))))
  : focusScore;
```

2. **Team report**: validate cached memory score against rule-based; ignore if deviation > 3:
```js
const ruleScore = calcFocusScore({...});
const cachedScore = m?.focus_score;
const focus_score = (cachedScore != null && Math.abs(cachedScore - ruleScore) <= 3)
  ? cachedScore
  : ruleScore;
// This immediately fixes Bansi's display without touching the DB.
```
