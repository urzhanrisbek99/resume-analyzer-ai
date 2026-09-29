# 1. Feature-Sliced Design, enforced by the linter

Status: accepted

## Context

The project has a large pure-logic core (extraction, parsing, scoring) and a
comparatively thin UI. Without a structure that separates them, the two drift
together: a rule starts reading a React context, a component starts holding a
parsing heuristic, and the core stops being testable in isolation.

Next.js provides routing, not architecture. Its `app/` directory says where a
URL lives and nothing about where a domain rule belongs.

## Decision

Feature-Sliced Design, with the layer order
`app -> views -> widgets -> features -> entities -> shared`.

Two naming decisions follow from the framework:

- The FSD `pages` layer is named `views`. Next.js treats `src/pages` as the
  Pages Router, so a layer with that name would be picked up as routing.
- The Next router stays at the repository root in `app/`, holding only thin
  route files that re-export from `views`. FSD layers live under `src/`.

Boundaries are checked by `eslint-plugin-boundaries` and fail CI:

1. A layer may import only from layers strictly below it.
2. A slice is reachable only through its single `index.ts`.
3. Entity-to-entity access goes through the `@x` segment (FSD 2.1), never
   through the public API of the target entity.

## Consequences

The rule engine has no framework dependency and runs unchanged in the browser,
on a server, and inside a test.

The constraint has already caught real mistakes rather than merely documenting
an intention: a widget that composed three other widgets, which belongs in the
view layer, and an entity reaching sideways into another entity.

The cost is ceremony. Every slice needs a public API file, and a genuinely
shared concern has to be placed deliberately rather than imported from wherever
it happens to sit. That cost is paid once per slice and is the point.
