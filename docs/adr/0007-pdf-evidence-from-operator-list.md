# 7. Read PDF font and spacing facts from the operator list, not the text layer

Status: accepted

## Context

`getTextContent` is the obvious API for reading a PDF, and for text it is the
right one. For the layout evidence the parseability dimension is built on, it
reports three things that quietly do not mean what they look like:

- The font of a fragment is an internal identifier (`g_d0_f1`) and a generic CSS
  family (`sans-serif`). The real typeface and the weight are absent, so a bold
  heading is indistinguishable from body text, and a check for ATS-unsafe fonts
  accuses every file of using one.
- A wide horizontal gap arrives as its own fragment whose text is a single space
  and whose width is the entire distance covered. Measured naively, the gap is
  filled with apparent text, and a borderless table or a column gutter — the two
  layouts that break an applicant tracking system most often — disappears.
- Side-by-side columns are usually set on shared baselines, so one visual line
  carries text from both of them. A box drawn around such a line spans the very
  gutter the detector is looking for.

All three fail silently. Text still comes out, scores are still produced, and
nothing in the output says the evidence is missing.

## Decision

Read the page's operator list first. It counts images and, as a side effect,
populates the font registry, which is keyed by the same identifier the text
layer uses and carries the PostScript name and the weight flags. Resolve each
fragment's font through it, falling back to the text layer for a page whose
operator list could not be read.

Drop whitespace-only fragments and recover gaps from coordinates instead. Record
each line's occupied horizontal ranges as spans, so a line that reaches across a
gutter is stored as the two pieces a reader sees, and run column detection over
spans rather than lines.

Treat `sans-serif`, `serif` and `monospace` as what they are — CSS keywords a
reader falls back to — and never report one as a non-standard font.

## Consequences

Heading detection gets a real weight signal, the font rule fires only on actual
typefaces, and gutters and borderless tables are detected from geometry on
documents produced by Word and by the common resume builders.

The font registry is not part of the typed pdf.js surface, so its shape is
declared locally and every access is guarded: an upgrade that moves it degrades
to the text-layer fallback rather than throwing.

This was found by building PDFs byte by byte in the test fixtures. Every one of
the three defects had been shipping, and no text fixture could have exposed any
of them.
