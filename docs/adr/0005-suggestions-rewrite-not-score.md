# 5. The model rewrites lines; it never scores

Status: accepted

## Context

Once a language model is in the product, the tempting move is to let it judge
the resume: it reads well, it sounds authoritative, and it is far less work than
sixty rules.

It is also the move that destroys the thing being sold. A score that changes
between two runs of the same document cannot be defended, cannot be regression
tested, and cannot explain itself beyond restating its own output. A candidate
who improves their resume and watches the number fall has no way to tell whether
they got worse or the model did.

## Decision

The division is strict:

- The deterministic engine decides what is wrong and how much it costs. Nothing
  the model returns affects a score.
- The model is offered one job: rewrite specific lines the engine has already
  flagged, to the standard the rule itself describes.

The interaction is scoped to match. A request carries the rule, its guidance and
at most six lines -- never the whole document. The response is parsed against a
zod schema; entries that fail validation are dropped rather than rendered, and a
rewrite identical to its input is dropped too.

Nothing is applied automatically. Suggestions sit beside the original and are
copied by hand.

## Consequences

The score stays reproducible and snapshot-testable, which is what makes the rest
of the product worth trusting.

The model is used where it is actually better than a rule and nowhere else, so
cost per analysis is near zero and a missing key degrades one feature instead of
breaking the page.

Users must copy rewrites themselves, which is slower than a one-click apply. The
friction is deliberate: a line the candidate has not read is a line they cannot
defend in an interview, and this tool exists to get them into interviews.

The prompt forbids inventing numbers, and the rule layer can only ask for a
restructure when no metric exists. A model will still occasionally produce a
plausible fabrication, so the UI states plainly that figures must be checked.
That is a mitigation, not a guarantee, and it is the weakest point of this
design.
