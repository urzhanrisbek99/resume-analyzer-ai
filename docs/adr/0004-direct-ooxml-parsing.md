# 4. Parse DOCX from OOXML rather than converting to HTML

Status: accepted

## Context

The usual way to read a .docx in JavaScript is a converter such as mammoth,
which turns the document into HTML and hands back clean text.

Clean text is exactly the wrong output here. The parseability dimension is built
on facts the conversion discards: which text sits inside a table, which sits in
a floating text box, whether the section is set in two columns, which fonts are
in play, and what is in the header and footer.

Those are not styling details. They are the reasons an applicant tracking system
mangles a document, and they are the most valuable thing the tool can report.

## Decision

Unzip the archive with `fflate` and read `word/document.xml`, `word/styles.xml`,
the header and footer parts, the relationship file and `docProps/app.xml`
directly, with namespace-aware DOM queries.

## Consequences

The extractor reports table rows with their cell counts, text box occurrences,
section column counts, the real font list, hyperlink targets that never appear
in the visible text, and the page count Word itself recorded rather than an
estimate from character length.

List markers need handling that a converter would have done: Word stores them as
numbering properties rather than characters, so a literal marker is materialised
during parsing. Without it, bullet detection downstream sees no bullets at all
in any Word document.

One dependency instead of one dependency, and a smaller one.

The cost is owning the OOXML reading code, including the parts of the format not
yet handled. That is acceptable because the alternative does not produce the
data the product exists to report.
