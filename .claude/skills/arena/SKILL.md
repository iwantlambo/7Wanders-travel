---
name: arena
description: Arena mode. Several agents answer the same task independently, a judge scores them against criteria the user confirms, and only the winning answer is returned. Run only when the user types /arena.
disable-model-invocation: true
---

# Arena mode

The task is: $ARGUMENTS

If no task was given, ask the user for it and stop.

## Step 1: Set up (always ask before starting)

Ask the user these in one message, with defaults so they can just reply "ok":

1. Scoring criteria. Propose 3 to 5 criteria that fit this task, each with a weight, adding up to 100. Example for a business question: feasibility 30, evidence 25, originality 20, clarity 15, risk awareness 10.
2. Number of competitors. Default 5, maximum 10.
3. Viewpoints. Propose one distinct viewpoint per competitor that fits the task (for example a VC, a sceptical operator, a customer, a CFO, a contrarian).
4. Rounds. Default 1. Option 2: the top two answers see the judge's critique and revise once.

Wait for the user's answer. Do not start until they confirm.

## Step 2: Competition

Spawn one subagent per competitor in parallel using the Agent tool (called Task in older Claude Code versions). Give each:

1. The task and any files or context the user provided.
2. Its viewpoint.
3. The criteria, so it knows how it will be judged.
4. The rules: work independently, answer in under 400 words, and end with the single biggest weakness of its own answer.

Competitors must not see each other's answers.

## Step 3: Judging

Spawn a separate judge subagent that did not write any answer. Give it all answers labelled A, B, C and so on, with viewpoints hidden, plus the criteria and weights. The judge must:

1. Score each answer on each criterion out of 10 and compute the weighted total.
2. Check facts and numbers where possible and penalise anything made up.
3. Pick a winner, and say whether a runner up has one idea worth adding.

If the user chose 2 rounds, send the top two answers back to their authors with the judge's critique, let them revise once, and judge again.

## Step 4: Output to the user

Keep it short:

1. The winning answer in full.
2. A small score table: answer, viewpoint, weighted score.
3. One line on why it won, and one idea from a runner up worth keeping, if any.

Do not show the losing answers unless the user asks.

## If subagents are not available

In normal chat you may not be able to spawn subagents. Then play each role yourself, one at a time, and write each one fully before starting the next, without letting earlier roles shape later ones.
