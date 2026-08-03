# The Orchestrator Role

A playbook for running a software mandate as an Owner/Orchestrator directing
one or more external coding agents, none of whom have direct access to the
real repository. Distilled from a real, extended session (the LFEA Linear
Static FEA mandate on this repo) — every pattern, checklist item and lesson
below was earned by something that actually happened, not designed in the
abstract. Use it as the operating manual for any new orchestrator session,
on this repo or another.

## 1. The three roles

**The human (you).** Final authority. Sets the mandate, approves scope
changes, resolves genuine judgment calls the Orchestrator flags, and can
override anything. The Orchestrator answers to you, not to the coding
agents.

**The Orchestrator (this role).** Has real repository access (can clone,
run commands, read full files) but does not usually write the bulk
implementation itself. Its job is: scope work grounded in real code,
dispatch it as precise written specs, and — critically — **independently
verify every claim before merging anything**. The Orchestrator is the only
party in the loop that can actually run the code against the real
repository, which makes it the only party that can catch the gap between
"looks right" and "is right."

**External coding agents.** Do the implementation. Typically run in
sandboxes with no route to the real repository (no `git clone`, no DNS to
GitHub, sometimes no way to run `npm test` against real fixtures). This is
not a hypothetical edge case — it happened on essentially every Work Pack in
the source session. Agents that behave well disclose this limitation
explicitly rather than fabricating a "tests pass" claim; treat honest
disclosure as a *good* sign, not a shortfall.

## 2. Core operating principles

These are the load-bearing rules. Everything else in this document is an
elaboration of one of these.

1. **Never trust, always verify.** An agent's "all tests pass" is a claim,
   not a fact, until the Orchestrator has run the same commands against the
   exact commit itself. This applies even to your own prior work — see §9.
2. **Ground every spec in real code, not assumptions.** Before writing a
   Work Pack issue, investigate the actual current state: read the files,
   run the existing checks, grep for the pattern you're about to describe.
   Planning documents and prior summaries go stale; source code doesn't lie
   (but can still surprise you — read it fresh each time).
3. **A GitHub Issue is the spec, not a chat message.** Deep technical
   content lives in the issue: exact schemas, exact function names, exact
   file boundaries, exact required proof commands. Not "please implement
   X," but the shape X must take and how its correctness will be checked.
4. **Fail closed, everywhere.** Both in what you ask agents to build (no
   silent defaults, no partial application, explicit rejection codes for
   every ambiguous case) and in how you review (a passing test you haven't
   read is not evidence).
5. **Small, reviewable, sequential slices over one large PR.** A mission
   that's too big to review with confidence is too big to dispatch as one
   Work Pack — split it (§4.4).
6. **The roadmap document is the single source of truth**, kept current
   after every merge, not written once and left stale (§8).

## 3. When to run a prequalification gate vs. dispatch directly

Not every Work Pack needs the same ceremony. Decide up front:

**Use a prequalification gate** (agent investigates and answers questions,
Orchestrator reviews the answers, *then* a second issue authorizes
implementation) when:
- The mission has real design degrees of freedom an implementer would have
  to guess at (a new schema shape, how to handle missing/ambiguous data,
  what the acceptance bar even means).
- You suspect — but haven't confirmed — that something is either already
  done (just needs a verification benchmark) or is a real gap (needs new
  production code), and getting this wrong changes the whole shape of the
  work.
- The mission is large enough that a wrong assumption would be expensive to
  discover only after a full implementation attempt.

**Dispatch directly with a single detailed technical issue** when:
- You've already grounded the design questions yourself (through direct
  investigation — see §4.1) and can pin the concrete decisions in the issue
  text.
- The mission is a natural next slice of an already-scoped larger effort
  (e.g., the second half of a split you already approved).
- The user or process context has explicitly asked for direct dispatch
  ("no questions this time").

Either way, the *investigation* still has to happen — the only thing that
changes is whether the investigation's findings become a question posed to
the agent, or a decision baked directly into the issue.

## 4. Writing a Work Pack issue

### 4.1 Ground it first

Before writing a word of the issue, go find out what's actually true.
Concretely, in the source session this meant:
- Cloning the real repo (or a worktree of it) and running the existing
  checks to see current state.
- Grepping for the exact functions/contracts a new mission would need to
  reuse, and reading them in full — not just their names.
- For data-shaped work, actually loading the real fixture and inspecting
  real records rather than assuming a schema from a stale doc. (One
  concrete example: an issue's first draft assumed a generic material
  attribute; a direct survey of the real fixture found specific ASTM grades
  and schedule text embedded in free-text fields instead — a materially
  different, better-grounded scope resulted.)
- If a prior Work Pack produced a fixture value you're tempted to reuse as
  "known good," re-derive or independently re-check it rather than trusting
  that it was ever verified against real data (see §9 — this is a real,
  repeatable failure mode, not a hypothetical).

### 4.2 Required sections

A Work Pack issue should contain, in roughly this order:

1. **Mission** — one paragraph, the concrete deliverable.
2. **Why this needs prequalification / why it doesn't** — if skipping the
   gate, state explicitly what grounding already resolved the design
   questions, with citations (file:line, or "verified by running X").
3. **Real ground truth** — the concrete facts from your investigation:
   exact function signatures to reuse, exact file paths, exact real data
   values where relevant (e.g. a real fixture's entity IDs, a real branch
   name, a real dataset's counts). Wrong specifics here cost the agent real
   time; get them right.
4. **Scope** — precisely what's in, stated as concretely as possible
   ("resolve X for entities where Y", not "handle the general case").
5. **Module boundary** — exact new file paths, exact exported function
   signatures, and *explicit statements of what must NOT go in which file*
   when a package boundary matters (this is what a source guard will
   enforce — see §6).
6. **Required reuse** — name the exact existing functions that must be
   called, with import paths. The single most effective anti-drift measure
   is naming the specific real function you expect reused, then requiring
   the source guard to assert it's actually imported and called.
7. **Concrete rules for every genuine ambiguity you can anticipate** — don't
   leave a real design fork as "use your judgment" if you can make the call
   yourself; if you truly can't, that's a sign this needed a
   prequalification gate instead.
8. **A concrete acceptance oracle wherever one exists** — real expected
   output values from real data, not just "should work correctly." If
   you're deriving the oracle from another Work Pack's fixture, say so
   explicitly and flag that it needs independent verification, not blind
   trust (§9).
9. **Required check script(s)** — exact names, exact registration slot
   names, and the specific real+synthetic cases the tests must cover
   (happy path, every fail-closed rule, at least one determinism/
   immutability check, at least one regression check that existing
   behavior is unchanged).
10. **Anti-drift requirements** — see §6.
11. **Allowed files** — an exhaustive list. Anything not listed is
    forbidden; state explicitly what an agent should do if it discovers it
    needs to touch a forbidden file ("stop and report, don't just do it").
12. **Required proof** — the exact shell commands the agent must run and
    paste real output for. This becomes the Orchestrator's own review
    checklist too (§7).
13. **Non-goals** — explicitly named future work this Work Pack does not
    attempt. Prevents scope creep in both directions (agent overreaching,
    and reviewer assuming something was covered that wasn't).
14. **Pull request** — the exact required PR title, and "open as draft, do
    not merge."

### 4.3 Prompt-writing rules

- **Deep technical spec, not process ceremony.** Don't write "please follow
  best practices" — name the specific practice and the specific mechanism
  that will check it.
- **Cite real file:line evidence for every factual claim in the issue.**
  If you're not sure, say "verify this yourself" rather than asserting it
  as fact.
- **Pin exact names.** Function names, error codes, schema identifiers,
  script filenames, npm script names. An agent following ambiguous naming
  will pick something plausible and different from what a second, parallel
  agent picks — this causes real collisions (see §9).
- **State the required PR title verbatim.** Keeps the Work Pack log
  consistent and searchable.
- **Never assert a technical/legal boundary from memory alone if you're not
  sure.** If unsure whether a category of data is safe to embed directly
  (public engineering constants) vs. must be disclosed as fictional/
  external-supply-only (licensed code tables), find the repo's own existing
  precedent for that boundary and cite it, rather than guessing.

### 4.4 Sizing and splitting

A Work Pack should represent a real, coherent, independently-reviewable
unit of work — not a token-sized token gesture, and not a sprawl that's
impossible to review with confidence. As a rule of thumb, the real
implementation diff (not the issue text) should land somewhere in the
neighborhood of a few hundred to about a thousand lines. If your grounding
work reveals a mission is much bigger than that, split it into an ordered
sequence of Work Packs up front (e.g. "contracts → extraction algorithm →
data resolution → production wiring"), dispatch only the first slice, and
scope each subsequent slice as its own issue once the prior one is merged
and validated — don't hand off the whole sequence in bulk.

### 4.5 Dispatching in parallel

Two Work Packs can run concurrently if and only if:
- They touch **entirely disjoint files** (verify this yourself before
  dispatching both — don't assume).
- Each issue explicitly lists the other's territory as forbidden, so an
  agent that wanders sees the boundary immediately.
- Any shared resource they both need to register into (e.g. a single
  aggregate npm script) is written defensively — see the sequential-slot
  and package.json-ordering lessons in §9; expect and plan for a rebase
  reconciliation, don't assume it away.

## 5. The prequalification questionnaire

### 5.1 Format

A prequalification issue looks like a Work Pack issue with the
"implementation spec" sections replaced by a numbered list of investigation
questions, each demanding **file:line evidence**, not opinion. Explicit
stop condition: *"post your answers as a single issue comment and stop —
wait for an Owner follow-up before writing any code."*

Standard structure:
1. **Mission** — what real-world question this mission needs answered
   before it can be scoped.
2. **Why this needs prequalification** — your own pre-investigation
   findings that make this a real, non-trivial decision (not a rubber
   stamp — show your own work so the agent isn't starting from zero).
3. **Prequalification questions** — numbered, each answerable only by
   reading real source or running real code, e.g.:
   - "Does mechanism X already exist? Cite the file, or state explicitly
     that you searched and found nothing."
   - "Propose a concrete schema/approach — show the shape, not just a
     description."
   - "What should the acceptance bar for 'done' concretely mean here?
     Propose one, with reasoning."
4. **Base/branch** — usually "no branch/PR needed for this phase."
5. **Non-goals for this phase** — "no production code, no new tests, no
   implementation — proposals and evidence only."
6. **Stop condition** — explicit, unambiguous.

### 5.2 Reviewing the answers

Do not accept a prequalification answer on faith just because it's
well-written and cites file:line references. Independently re-run at least
the most load-bearing claims yourself (re-execute a reproduction script the
agent describes; grep for a pattern the agent claims doesn't exist
elsewhere; re-derive a number the agent computed). In the source session,
doing this consistently caught real errors on both sides — sometimes the
agent's claim was wrong, sometimes a value the Orchestrator had assumed was
ground truth turned out to be unverified illustrative data (§9). Then:
- Accept, reject, or partially accept each proposal explicitly, with
  reasoning, as a follow-up issue comment (`add_issue_comment`, never an
  issue-body overwrite — see §7.4).
- Decide the actual next authorized step (which might be "just add a
  verification benchmark," not new implementation — a real, common outcome
  when the investigation finds a capability already exists under a
  different name).
- Open a fresh, concrete implementation issue for whatever's authorized —
  don't let the prequalification issue's own body silently become the
  implementation spec after the fact.

### 5.3 Worked example (condensed)

A real prequalification issue from the source session, condensed:

> **Mission:** Determine the real shape of Benchmark B — a governed
> analysis-authority overlay for the real project, scoped to one line/
> branch, to get a first genuine non-BLOCKED solve.
>
> **Why this needs prequalification:** [five bullet points citing exact
> file:line evidence for: the real blocking status and reason string; that
> no per-object authority schema exists anywhere yet, with the closest
> analog named and why it doesn't fit; the real raw signal present in the
> fixture and its real completeness gaps with counts; that no
> subset-extraction utility exists, with the one ad hoc precedent cited.]
>
> **Prequalification questions:**
> 1. Overlay schema — propose a concrete schema... show the shape.
> 2. Missing-attribute objects — is there a real branch with zero such
>    diagnostics? Find and name one, or report that none exists.
> 3. Material/section resolution — does anything already map raw signal to
>    resolvable authority? If not, say so explicitly.
> 4. Branch extraction — real edge cases or a straightforward filter? Check
>    the existing grouping module for what it already handles.
> 5. Acceptance bar — what should "genuine non-BLOCKED" mean concretely?
> 6. Scope boundary — does this fit one Work Pack, or need splitting?
>
> **Stop condition:** Post answers as a comment and stop.

The Owner's review re-ran the agent's own branch-scan reproduction script
directly, spot-checked three of its most load-bearing source citations
against the real files, found every checked claim held up exactly, accepted
the proposed schema and a four-way split, and authorized only the first
slice as a fresh implementation issue.

## 6. Anti-drift requirements

An "anti-drift" or "source guard" check reads a package's source as *text*
and asserts things a functional test can't: that a specific hash
implementation was reused rather than duplicated, that a specific pattern
(a re-derived formula, a silently-swallowed error, a hardcoded fallback) is
absent, that a specific real function is genuinely imported and called (not
just plausible-looking code that happens to produce the right numbers).

Rules for writing one:
- **Prefer positive proof-of-reuse assertions over negative pattern bans**
  where the negative ban would be unreliable. Banning "any local
  reimplementation of X" by regex is fragile; asserting "the real function
  X is genuinely imported and called" is robust and catches the same class
  of drift more reliably.
- **Extend an existing guard rather than creating a parallel one** when a
  new file belongs to the same conceptual package — keeps the check surface
  from fragmenting.
- **Assert package-manifest registration by presence and relative order
  (`indexOf` comparisons), never by literal string adjacency.** A guard
  that requires two script names to appear directly back-to-back will break
  silently the next time a legitimate insertion lands between them — this
  happened for real, went unnoticed for multiple merges, and silently
  broke a top-level aggregate check the whole time. Check "A is present,
  and A's position is after B's position," not "A immediately follows B."
- **Ban known real bug classes directly**, not just generically: e.g. a
  nested `Object.freeze()` call outside the package's single top-level
  freeze point (which silently defeats a "skip already-frozen values"
  deep-freeze implementation and leaves nested state mutable forever) is
  worth a named, explicit rejection rule once you've seen it happen once.
- **A per-package line-count cap is legitimate and will be tripped by real
  new files** — an agent with no repository access cannot know it's about
  to violate one. When it happens, the fix is usually a mechanical split
  along a natural seam (e.g. "orchestration entry point" vs. "derivation
  helpers" vs. "child-object augmentation"), not a design change.

## 7. Owner review checklist (before merging anything)

Run this in full, every time, even when the agent's own report sounds
confident and complete.

1. **Fetch and clone the exact PR head** into an isolated worktree — never
   review from the agent's description alone.
2. **Diff against the stated base and confirm scope matches the claim** —
   exact file count, exact file paths, nothing outside the allowed list.
3. **Check whether the base has moved** since the branch was cut. If other
   work has merged to `main` in the meantime, rebase the worktree locally
   to confirm there's no hidden conflict (even if the platform reports
   "mergeable: clean" — verify it yourself when two Work Packs touch a
   shared file like a package manifest).
4. **Read the new/changed source files in full before running anything.**
   Understand what the code claims to do and why, not just what the tests
   assert.
5. **Install dependencies and run every command from the issue's "Required
   proof" list yourself**, verbatim. A command the agent could not run
   (because its sandbox had no repo access) is exactly the command most
   likely to reveal a real problem — this is not optional.
6. **When a real check fails, investigate before assuming either side is
   wrong.** Don't reflexively "fix the code to match the test" or "fix the
   test to match the code" — trace the actual data. In the source session,
   the correct fix was sometimes in the agent's code, sometimes in the
   Orchestrator's own issue-specified acceptance oracle (see §9) — you
   cannot know which without checking.
7. **Hand-verify at least the most load-bearing arithmetic or logic
   yourself**, independent of the script's own "PASS" output, whenever the
   mission's own promise is "closed-form" or "independently verifiable."
   Recompute a value from first principles and compare.
8. **Confirm anti-drift guards genuinely run and genuinely catch what they
   claim to** — don't just see "PASS" and move on; spot-check that a
   deliberately-reintroduced violation would actually be caught (or at
   minimum, read the guard's own logic to confirm it's checking what it
   says).
9. **Fix small, clear, well-understood defects directly** rather than
   bouncing back to the agent for a second round-trip, when you're
   confident in the fix and can verify it immediately. Document exactly
   what you changed and why in the merge commit and the review comment.
10. **Only merge after every required command has actually been run by
    you, against the exact head, with real output you've read.**

### 7.1 What to look for in "the agent could not run this" reports

Treat an honest "my sandbox has no repository access, here's what I could
verify locally and here's what remains" as trustworthy signal, not evasion
— it is usually exactly correct, and pretending otherwise (fabricating
output) is the actual failure mode to watch for. The absence of a false
claim is itself useful information.

### 7.2 Review comment format

Post the review as a single, structured issue/PR comment covering, in
order: what you cloned and verified; what (if anything) you found and
fixed, with the reasoning; the real output of every required command; final
disposition (merged / needs another round / declined). This comment is
itself part of the historical record — write it so a future reader (or a
future you) can reconstruct exactly what was checked without re-running
anything.

### 7.3 Merge

Use a squash merge with a commit message that: summarizes what the change
actually does technically (not just "implements issue #N"), and explicitly
notes what Owner validation found/fixed if anything did. This message is
permanent project history — make it earn its place.

### 7.4 Communicating with agents via GitHub

- Use `add_issue_comment` for all reviews, approvals, and follow-ups.
  **Never use an issue-update method's body parameter to post a review** —
  it silently overwrites the issue's original spec instead of adding to the
  thread, destroying the authoritative record. (This mistake happens
  exactly once before it's memorized; document it in your own roadmap the
  first time it happens so it doesn't happen twice.)
- It is safe to edit an issue's *body* directly only before any agent has
  started work from it (i.e., you're still authoring the spec). Once work
  may be underway, all further changes go in comments, even your own
  corrections.
- Close issues explicitly with a state reason, referencing the merge commit
  SHA, once genuinely done.

## 8. Roadmap maintenance

Keep one living document (e.g. `docs/OWNER_ROADMAP.md`) that is the single
source of truth for phase status and Work Pack history — explicitly more
authoritative than any older planning document, which the roadmap itself
should say plainly (and should warn readers to re-verify stale claims
against current source rather than trusting old docs blindly).

After every merge, update:
- **The Work Pack log** — mission/issue/PR/status/one-line technical
  summary.
- **The phase-status table** — what's real now, not what was planned.
- **The "recommended forward sequence"** — what's next and why, with
  enough technical grounding that a future session doesn't have to
  re-derive it from scratch.
- **Process notes** — see §9. This is not optional decoration; it is how a
  new orchestrator session (or a future you) avoids repeating a mistake
  that's already been paid for once.

Renumber mission slots when necessary (if a placeholder mission number gets
reused for something that actually shipped first) rather than letting two
different things claim the same identifier.

## 9. Process lessons — a living log, not a one-time list

Keep growing this. Each entry should be concrete enough to prevent the
exact same mistake, not a vague platitude. Examples, drawn from a real
session, in the pattern to imitate:

- **A clean auto-merge (no conflict markers) is not proof of a correct
  merge.** When two missions touch the same functions, re-run the full
  suite after reconciling, and if anything is backend/representation-
  conditional, exercise every branch explicitly — don't trust the absence
  of conflict markers.
- **Sequential slot numbers collide when missions are scoped in parallel
  without a shared counter.** Whichever PR merges first keeps the number;
  the loser gets rebased, renamed, and re-validated. Expect this to keep
  happening and treat it as routine reconciliation, not a sign something
  went wrong.
- **A hand-reconstruction of the real logic is not evidence the real code
  works.** An agent's own "I verified this against an isolated
  reimplementation of the equations" can pass while the actual production
  code, called correctly, fails — because the reconstruction never
  exercised the real function's actual argument shape. Only exact-head
  execution catches this class of bug.
- **Per-package anti-drift guards are invisible to a sandbox with no
  repository access**, and will fail new files that never triggered them
  before (a line-count cap, a forbidden-pattern regex). Don't credit an
  agent's own "validation passed" as covering a guard it never had the
  files to run.
- **A source guard's own literal-adjacency check can go stale across
  several *legitimate* merges before anyone notices**, because each
  Work Pack's own validation only proves its own diff, not the cumulative
  state after N prior insertions. Prefer presence-and-order checks over
  literal-adjacency checks from the start (§6).
- **A hand-typed fixture value for a free-text field is not verified
  ground truth, even after it passes a real contract's real validation** —
  and the Orchestrator can propagate that exact mistake into a later
  issue's own "acceptance oracle" just as easily as an agent can introduce
  it. A value that merely *passed a schema validator* is not the same
  claim as a value that was *independently derived from real data*.
  Re-derive or independently re-check anything you're about to assert as
  ground truth, including — especially — your own prior work.
- **Restoring deleted infrastructure to satisfy a stale assertion is not
  the same as fixing the assertion.** If a check depends on something that
  was deliberately removed as non-functional, the honest fix updates the
  check to reflect the mechanisms that actually work today, not resurrect
  the dead thing.
- **"Reachable" and "governed" are different acceptance bars — say which
  one you mean.** A numeric result appearing is not the same claim as a
  numeric result backed by traceable, approved authority. Don't let a
  Work Pack's exit criterion quietly default to the weaker one.

## 10. Best practices to encode into every implementation Work Pack

These are the standing engineering-quality rules worth naming explicitly in
every issue, because a sandboxed agent without full repository context
cannot infer them from vibes:

- **Reuse real, already-proven functions and modules; never re-derive
  mechanics, hashing, or formatting that already has a canonical
  implementation elsewhere in the repo.** Name the exact function.
- **Fail closed on every ambiguous or conflicting case** — an explicit,
  named rejection code beats a silent default every time. No `?? fallback`
  on a value that represents a real policy decision.
- **Determinism is non-negotiable**: no `Math.random`, `Date.now()`,
  `new Date()`, or locale-dependent comparators (`.localeCompare()`) in
  anything that produces a stable identity or hash.
- **Immutability discipline**: freeze exactly once, at the final boundary,
  using the package's one shared deep-freeze utility — never a local
  `Object.freeze()` partway through construction (it silently defeats
  "skip already-frozen" deep-freeze recursion and leaves children mutable).
- **Hash/identity fields must exclude themselves (and any field set only
  after they're first computed) from their own input** — verify this by
  tracing the actual order of assignment, not by assuming it's fine.
- **Real data over fictional data, wherever the data category is
  legitimately public** (basic physical constants, standard dimensional
  data) — but explicitly and clearly disclaim anything that would require
  reproducing licensed/proprietary reference material (specific code-body
  allowable-stress tables, etc.), following whatever precedent the
  repository has already established for that exact boundary.
- **Traceability**: every derived or inherited value should carry evidence
  of where it came from (which real record, which real neighbor, which
  real citation) — "it's probably fine" is not evidence.
- **Test real production chains, not isolated units, wherever the mission
  claims to prove something end-to-end.** A closed-form benchmark should
  drive data through the actual compile → solve → recover chain and only
  independently hand-derive the *expected* value — never both sides of the
  comparison from the same code path.

## 11. Quick-reference checklists

### 11.1 Before opening a Work Pack issue
- [ ] Investigated real current code state directly (not from a stale doc)
- [ ] Confirmed exact function names / file paths / real data values to cite
- [ ] Decided: prequalification gate, or direct dispatch with grounded specs?
- [ ] Sized the scope (roughly a few hundred to ~1000 lines of real diff);
      split if bigger
- [ ] If dispatching in parallel with another live Work Pack, confirmed
      disjoint files and named the other's territory as forbidden in both
- [ ] Every genuine ambiguity either resolved with a concrete rule, or
      explicitly flagged as needing the human's judgment
- [ ] Allowed-files list is exhaustive; required-proof command list is exact
- [ ] Anti-drift requirements specified (reuse-proof assertions, ordering
      checks, known-bug-class bans)
- [ ] Required PR title stated verbatim

### 11.2 Before merging any PR
- [ ] Cloned the exact head into an isolated worktree
- [ ] Confirmed base hasn't silently diverged; rebased locally to check
- [ ] Diff scope matches the claim exactly
- [ ] Read every new/changed source file in full
- [ ] Ran every required-proof command yourself, against the real head
- [ ] Investigated (not assumed) the cause of any failure before fixing
      either side
- [ ] Hand-verified the most load-bearing arithmetic/logic independently
- [ ] Confirmed anti-drift guards genuinely run and genuinely check what
      they claim
- [ ] Posted a structured review comment with real output, before merging
- [ ] Merge commit message technically summarizes the change and any
      Owner-side fix
- [ ] Roadmap doc updated in the same session, before moving on

## 12. One-paragraph summary

Ground every Work Pack in a direct read of the real repository, not a
memory of what it used to contain. Write the GitHub Issue as the actual
technical spec — exact names, exact files, exact required proof — and skip
ceremony that doesn't change what gets built or how it gets checked. Let
agents implement without repository access, and treat their honest
disclosure of that limitation as trustworthy. Then verify everything
yourself, against the exact commit, by actually running it — including,
especially, the parts of your own prior specs an agent's output might
disagree with. Keep one living roadmap document that records what shipped,
what was decided and why, and what went wrong once so it doesn't go wrong
twice.
