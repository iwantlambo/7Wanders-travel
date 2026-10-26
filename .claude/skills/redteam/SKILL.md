---
name: redteam
description: Red team mode. Several attacker agents try to break an idea, plan, pitch or document from different angles, then the risks are ranked with fixes. Run only when the user types /redteam.
disable-model-invocation: true
---

# Red team mode

What to attack: $ARGUMENTS

If nothing was given, ask the user what to attack and stop.

## Step 1: Set up (always ask before starting)

Ask in one message, with defaults so the user can reply "ok":

1. Goal of the thing being attacked (for example: raise funding, win customers, pass an interview, get approval).
2. Attack angles. Propose 4 to 6 that fit, for example: market and demand, competitors, money and unit economics, legal and regulatory, operations and execution, customer behaviour.
3. Severity. Default: find fatal and serious problems only, skip nitpicks.

Wait for the user to confirm.

## Step 2: Attack

Spawn one subagent per angle in parallel using the Agent tool (called Task in older Claude Code versions). Each attacker must:

1. Assume the plan has a flaw and hunt for it from its angle only.
2. List up to 5 failure points, each with: what goes wrong, why it is plausible, likelihood (low, medium, high) and impact (low, medium, high, fatal).
3. Back claims with evidence or clear reasoning. No made up numbers.

## Step 3: Rank

Spawn a separate referee subagent that merges duplicates, removes weak or unsupported attacks, and ranks the rest by likelihood times impact.

## Step 4: Output to the user

Keep it short:

1. Fatal risks, if any, at the top.
2. A table of the top 5 to 8 risks: risk, likelihood, impact, fix.
3. The single most important thing to fix first.
4. One line on what the plan already does well, so the user knows what not to change.

## If subagents are not available

In normal chat you may not be able to spawn subagents. Then play each role yourself, one at a time, and write each one fully before starting the next, without letting earlier roles shape later ones.
