---
name: research
description: Research mode. Several research agents investigate one topic from different angles, then the findings are checked and merged into one sourced brief. Run only when the user types /research.
disable-model-invocation: true
---

# Research mode

The topic: $ARGUMENTS

If no topic was given, ask for it and stop.

## Step 1: Set up (always ask before starting)

Ask in one message, with defaults so the user can reply "ok":

1. The decision or question the research should answer.
2. Angles. Propose 3 to 5 that fit, for example: market size and trends, competitors, customers and pain points, regulation, costs and pricing.
3. Geography and time range. Default: global, last 2 years.
4. Output length. Default: one page brief.

Wait for the user to confirm.

## Step 2: Research

Spawn one subagent per angle in parallel using the Agent tool (called Task in older Claude Code versions). Each researcher must:

1. Use web search and fetch the actual pages, not just snippets.
2. Prefer primary sources: company sites, regulators, filings, official statistics, reputable press.
3. Record a link for every fact and number.
4. Mark anything it could not confirm as unconfirmed.
5. Return key findings in under 300 words.

## Step 3: Check and merge

Spawn a separate editor subagent that:

1. Removes duplicates and anything without a source.
2. Flags where sources disagree.
3. Writes the brief so it answers the decision or question from Step 1.

## Step 4: Output to the user

1. The answer in 2 to 3 sentences.
2. Key findings grouped by angle, each with its source link.
3. Where sources disagree, and what is still unknown.
4. Suggested next steps.
5. A sources list at the end.

## If subagents are not available

In normal chat you may not be able to spawn subagents. Then research each angle yourself, one at a time, keeping a source link for every fact, then merge.
