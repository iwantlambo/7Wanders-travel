---
name: customers
description: Synthetic customer panel. AI personas review a product, pitch or landing page and give honest buying feedback. Run only when the user types /customers.
disable-model-invocation: true
---

# Synthetic customer panel

What to test: $ARGUMENTS

## Step 1: Set up (always ask before starting)

If anything is missing, ask in one message, with defaults:

1. What is being tested: product description, pitch, landing page link, screenshots or a file.
2. Who the target customer is: job, industry, country, company size.
3. Number of personas. Default 5, maximum 8.
4. The main question: would they buy, what confuses them, what price feels right, or all three (default).

Then propose the persona list. For each persona give: name, role, background, how they solve the problem today, budget, and one reason they might say no. Make at least one persona a sceptic and one a person who is happy with their current solution.

Wait for the user to confirm or edit the list. Do not start until they confirm.

## Step 2: Panel

Spawn one subagent per persona in parallel using the Agent tool (called Task in older Claude Code versions). Each persona must:

1. Stay in character and judge only from what it was shown.
2. Describe its first 30 seconds: what it understood and what confused it.
3. List its top objections.
4. Say whether it would try it, whether it would pay, and at what price, with a reason.
5. Name what would change its mind.

Tell every persona to be blunt, not polite. Saying no is a valid answer.

## Step 3: Summary to the user

Keep it short:

1. Verdict table: persona, would try (yes or no), would pay (yes or no), price.
2. Top 3 objections, ranked by how many personas raised them.
3. Top 3 fixes.
4. Questions to ask real customers to check these findings.

End with one line: this is a simulation, and real demand only shows when real customers pay or sign up.

## If subagents are not available

In normal chat you may not be able to spawn subagents. Then play each role yourself, one at a time, and write each one fully before starting the next, without letting earlier roles shape later ones.
