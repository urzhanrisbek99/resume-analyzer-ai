# 2. A deterministic engine, with the model as an optional layer

Status: accepted

## Context

The obvious way to build a resume checker today is to send the text to a
language model and render what comes back. It is fast to write and produces
plausible output.

It also produces a different score for the same resume on two consecutive runs,
cannot explain why a number moved, costs money per analysis, and stops working
entirely without an API key.

A score a user cannot reproduce is a score they will not act on.

## Decision

The product is a deterministic rule engine. The model is an optional layer on
top of it that rewrites wording, never one that assigns scores.

- Scoring works by subtraction: each dimension starts at 100 and loses points as
  rules fire. A rule that does not apply is excluded from the dimension rather
  than counted as a pass, so a resume is never rewarded for a check that never
  ran.
- Findings are sorted by severity, then by cost, then by rule id, so the order
  is fully determined and snapshot tests do not flake.
- Identifiers are derived from content, not from a counter or a clock.
- The current time is injected, never read inside the engine.

## Consequences

The same document always yields the same score, the same findings, in the same
order. That makes the output snapshot-testable over a corpus of fixtures and
makes a regression visible as a diff.

The application works completely offline and at zero marginal cost. A missing
key degrades the product rather than breaking it.

The cost is that every judgement has to be expressed as a rule with a threshold.
Nuance a model would catch for free has to be written down, argued for, and
tuned. Sixty rules is a lot of prose. It is also sixty pieces of advice that can
be inspected and disagreed with, which is the trade being made.
