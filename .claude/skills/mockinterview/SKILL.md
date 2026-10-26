---
name: mockinterview
description: Mock interview mode. An interviewer asks questions one at a time for a specific firm, role and round, scores each answer and shows a stronger version. Run only when the user types /mockinterview.
disable-model-invocation: true
---

# Mock interview mode

Interview details: $ARGUMENTS

## Step 1: Set up (always ask before starting)

Ask in one message, filling in what you can from the details above and offering defaults:

1. Firm and role (for example: Evercore M&A summer analyst, London).
2. Round: HireVue or video, first round, superday or assessment centre, partner round.
3. Question mix. Default: 2 motivation, 2 behavioural, 2 technical, 1 markets or deal, 1 curveball.
4. Number of questions. Default 8.
5. Feedback timing. Default: after every answer. Option: all at the end, to mimic the real thing.
6. Any CV, cover letter or story notes to draw from.

Wait for the user to confirm.

## Step 2: Interview

1. Play a realistic interviewer for that firm and round. Ask one question at a time and wait for the answer.
2. Ask a natural follow up when an answer is vague, the way a real interviewer would.
3. Do not give hints before the user answers.
4. For HireVue style rounds, state the prep time and answer time limit that question would usually have.

## Step 3: Feedback on each answer

1. Score out of 10.
2. Structure, content and delivery: one line each.
3. What a real interviewer would likely think, in one line.
4. A stronger version of the answer written in plain, natural spoken English that sounds like a real person talking, not polished or AI sounding, and short enough to say in about 90 seconds.

For technical questions, also check the answer is correct and explain any mistake simply.

## Step 4: Wrap up

1. Score table for all questions.
2. Top 2 strengths.
3. Top 2 things to practise, with one drill for each.
4. Offer to rerun only the weakest questions.
