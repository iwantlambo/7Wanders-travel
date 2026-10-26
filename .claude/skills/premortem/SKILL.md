---
name: premortem
description: Premortem mode. Imagine the project has already failed, have several agents explain why, then turn that into early warning signs and actions to take now. Run only when the user types /premortem.
disable-model-invocation: true
---

# Premortem mode

The project: $ARGUMENTS

If nothing was given, ask the user for the project and stop.

## Step 1: Set up (always ask before starting)

Ask in one message, with defaults so the user can reply "ok":

1. Time horizon. Default: 2 years from today.
2. What "failure" means here (for example: shut down, never got paying customers, ran out of money, co founder split).
3. Number of failure stories. Default 5. Propose a different main cause for each, for example: no demand, ran out of cash, team problems, a competitor won, legal or regulatory block.

Wait for the user to confirm.

## Step 2: Failure stories

Spawn one subagent per story in parallel using the Agent tool (called Task in older Claude Code versions). Each writes, in under 250 words, a realistic story told from the future: "It is [date]. The project failed. Here is what happened." Each story must:

1. Follow a believable month by month path, not a sudden disaster.
2. Name the first warning sign that appeared and when.
3. Name the decision that, looking back, sealed the outcome.

## Step 3: Synthesis

Spawn a separate analyst subagent to read all stories and pull out:

1. Causes that appear in more than one story.
2. Early warning signs the user can track, with a number or test for each where possible.
3. Actions to take in the next 30 days.

## Step 4: Output to the user

Keep it short:

1. One line per story: the cause and the sealing decision.
2. Top 3 shared causes.
3. Warning sign tracker: sign, how to measure it, when to act.
4. Next 30 days: 3 to 5 actions.

## If subagents are not available

In normal chat you may not be able to spawn subagents. Then play each role yourself, one at a time, and write each one fully before starting the next, without letting earlier roles shape later ones.
