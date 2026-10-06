# 6. Parse a batch in workers, and fall back rather than fail

Status: accepted

## Context

Recruiter mode reads up to twenty-five resumes in one go. Parsing a PDF is tens
of milliseconds of synchronous work, and the analysis on top of it is more. Run
inline, a batch freezes the tab: the progress bar does not move, sorting does
not respond, and the page looks broken at exactly the moment it is working
hardest.

Yielding between files with a timeout, which is what the first version did,
spreads the work out but does not remove it from the main thread. Each file is
still one long task.

## Decision

A pool of web workers, capped at four and at one fewer than the reported core
count. Each worker calls the same `screenFile` the main thread would; the
worker file itself is twenty lines of message plumbing and no logic.

Keeping the work in a plain async function is the part that matters. It runs
and is tested without a worker, and the fallback cannot drift from the fast
path because there is only one implementation.

Every failure falls back to the main thread rather than dropping a file:

- No `Worker` constructor at all, as under some embedded browsers.
- Construction refused by a Content-Security-Policy.
- A worker crashing mid-batch, in which case its current file is returned to the
  shared queue for another worker, or for the main thread once the pool drains.

File bytes are transferred, not copied, so a batch does not duplicate tens of
megabytes across threads.

## Consequences

Measured over twenty resumes, against the same batch running inline:

| Payload     | Workers               | Main thread only       |
| ----------- | --------------------- | ---------------------- |
| ~1 KB each  | 495 ms, 0 ms blocked  | 428 ms, 152 ms blocked |
| ~6 KB each  | 599 ms, 0 ms blocked  | 561 ms, 190 ms blocked |
| ~19 KB each | 760 ms, 60 ms blocked | 816 ms, 288 ms blocked |

Main-thread blocking effectively disappears, which was the goal. Wall-clock time
is the honest caveat: for small files the pool is slightly _slower_, because
spawning four workers and loading the bundle into each costs more than parsing a
one-kilobyte text file. The two cross over as files grow, and a real PDF is far
heavier than the largest row above.

The cost that is not in the table is complexity. There is now a message
protocol, a pool, a queue and three fallback paths, where before there was a
loop. That is justified by the freeze being the single most visible defect in
recruiter mode, and it is bounded: the protocol carries two message shapes and
the pool is a hundred lines.

Results arrive in completion order rather than input order. That is invisible
because the shortlist is sorted by fit, but it would matter if the table ever
offered an upload-order view.
