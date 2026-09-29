# 3. The file never leaves the device

Status: accepted

## Context

A resume is among the most sensitive documents a person owns: full name, phone
number, home city, employment history, and often a date of birth. Users are
right to hesitate before uploading one to a website they found through a search.

"We only send it to the model" is the kind of sentence that loses trust the
moment someone thinks about it carefully.

## Decision

The file is read into browser memory and parsed there. Extraction, segmentation,
scoring and rendering all run client-side. No upload endpoint exists.

The optional suggestion layer is the single outbound path, and it is narrow:

- It sends text, never the file.
- Personal data is replaced with stable placeholders before the request and
  restored in the response: name, email, phone, location, links.
- `assertRedacted` runs immediately before every outbound request and throws if
  any known personal value survived. A redaction bug must fail loudly rather
  than leak quietly.
- Nothing is persisted. There is no database and no analytics on document
  content.

## Consequences

The guarantee is verifiable rather than promised: a user can open the network
tab and see that nothing moves.

Deployment is trivial and free. The application is a static bundle.

The costs are real. Parsing runs on the user hardware, so a large PDF is slower
than it would be on a server. Batch screening for recruiters has to be designed
around the main thread, which is what a Web Worker is for. And there is no
server-side corpus to tune rules against, so thresholds are informed by
published ATS behaviour and hand-built fixtures rather than by observed data.

That last cost is the one worth restating: without telemetry, improving the
engine depends on deliberate fixtures rather than on watching users.
