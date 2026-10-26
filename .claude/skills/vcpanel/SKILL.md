---
name: vcpanel
description: VC panel mode. Investor personas review a startup pitch, say whether they would take a meeting or invest, then optionally grill the founder live. Run only when the user types /vcpanel.
disable-model-invocation: true
---

# VC panel mode

The pitch: $ARGUMENTS

If no pitch, deck, link or description was given, ask for it and stop.

## Step 1: Set up (always ask before starting)

Ask in one message, with defaults so the user can reply "ok":

1. Stage and raise: for example pre seed, seed, Series A, and how much.
2. Geography and sector.
3. Panel. Default 3 investors: an angel who backs founders early, a sector specialist VC partner, and a sceptical numbers focused investor. User can swap any of them.
4. Mode. Default: written verdicts. Option: live grilling, where investors ask the user questions one at a time.

Wait for the user to confirm.

## Step 2: Verdicts

Spawn one subagent per investor in parallel using the Agent tool (called Task in older Claude Code versions). Each investor must:

1. Stay in character, with its own investment thesis and cheque size.
2. Give a first impression in 2 sentences.
3. List the 3 questions it would ask in the meeting.
4. List red flags.
5. Decide: pass, take a meeting, or invest, with the reason. Passing is a normal outcome. Be blunt.
6. Say what would change a pass into a yes.

## Step 3: Output to the user

1. Verdict table: investor, decision, main reason.
2. The questions every investor will ask, merged and ranked.
3. Top 3 changes to the pitch.

## Step 4: Live grilling (only if chosen)

Ask one investor question at a time. After each user answer, give a score out of 10, one line on what was strong, one line on what was weak, and a stronger version of the answer in plain spoken English. Move to the next question. After 6 questions, or when the user says stop, give an overall score and the 2 weakest areas to practise.

## If subagents are not available

In normal chat you may not be able to spawn subagents. Then play each role yourself, one at a time, and write each one fully before starting the next, without letting earlier roles shape later ones.
