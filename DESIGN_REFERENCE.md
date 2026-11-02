# Hyperknow Reference Contract

Reference: https://agent.hyperknow.io/ (authenticated pages inspected on 2026-10-26).
The local product retains the Knowra name and its existing courses and workspace data.

## Course blueprint panel, 2026-10-27

Reference: the two user-supplied screenshots ending in `049f29b9` and `b278af8c`.
They show a conversation beside an independent right panel, with a node-based
course blueprint and a separate course directory. This is a structural adaptation;
exact source typography, source illustration assets and hidden interactions are
not available from the screenshots and are not claimed as pixel-identical.

`src/components/course-blueprint-panel.jsx` uses the existing Radix/shadcn Sheet
and Tabs, shared Knowra controls and theme tokens. No external artwork is required
for the diagram: edges and nodes represent actual plan data. It displays unit,
lecture and knowledge-point relationships, zoom, fit-to-width, mouse panning,
native touch scrolling, full-screen viewing and node details. It does not invent
projects or assessments absent from the returned course data. The course tab
shows planned lectures and replaces their status and summaries with actual
validated unit results; generated quizzes and course/lesson links appear when
available.

At 1440px and wider the panel is modeless, leaving the conversation and composer
usable beside it. Smaller screens use a modal panel with focus containment.
Opening preserves the blueprint card's viewport anchor. Closing restores focus;
tab selection and graph pan/zoom survive view switching. Panel, tab and node
entrances respect reduced motion. `blueprint.css` owns only this composition.

`npm run qa:blueprint` covers 320, 390, 1024, 1440 and 2048px with separate test
workspaces: node counts from a real-shaped plan fixture, zoom/pan, node details,
keyboard tabs, focus return, overflow, full screen and zero model calls when
previewing. `qa:creation` additionally verifies wrapped model JSON, the confirmation
gate, retained partial results, live status in both preview tabs, completed quizzes
and links to the generated course. These browser model responses are fixtures.
The separate configured-provider smoke check returned a valid two-unit, four-lecture
blueprint after the JSON-mode/parser fix; it does not establish model reliability
for every prompt. Evidence: `screenshots/blueprint-panel/` and
`screenshots/course-creation-chat/`.

## Learner-controlled course depth, 2026-10-27

Course generation has no product cap on units, lectures per unit or teaching
fragments per lecture. The former three-unit/two-lecture restriction was an
implementation choice, not a constraint taken from the reference product.
The conversation now offers overview, systematic learning, deep mastery and
goal-based recommendation, plus an optional free-form lecture/time preference.
The controls reuse the existing radio choices, shared Input and theme tokens;
no new visual assets or shared-component styles are introduced.

Planning and lesson prompts receive these preferences. Changed preferences
require a newly validated blueprint before generation can continue. Failed
replanning retains the previous blueprint and generated results. Content is
generated and saved one lecture at a time; reloading resumes after the last
completed lecture, including within a partially generated unit. The blueprint
map and course preview show actual lecture completion separately from units.
Provider response limits still apply; they do not define the pedagogical scope.

`qa:depth` uses a four-unit/three-lecture fixture and isolated SQLite workspace
to verify preference persistence, failed replanning, confirmation gates,
interrupted generation and twelve unique delivered lectures. Preference layouts
were reviewed at 320, 390 and 1440px; the initial planning action is exercised at
320px. A separate request to the configured provider returned a valid four-unit,
twelve-lecture blueprint. That check does not assert the quality of twelve fully
generated real-model lectures. Evidence: `screenshots/course-depth/` and
`.local/course-depth-check/verification.json`.

## Course creation toolbar, 2026-10-27

Superseded by the user's later removal request (screenshot ending in `c3eeb9ac`).
The entire course toolbar and its 62px reserved space have been removed.
Only the global application header remains; conversation content starts 24px
below it. New courses use the existing sidebar entry; template/manual creation
remain in the empty conversation. Screenshots at 390/1440px:
`screenshots/creation-toolbar-removed/`. The following describes the earlier state.

The user-supplied screenshot ending in `9faa5671` identifies the course return
link and creation actions as top-bar controls. They now occupy a fixed toolbar
below the global header, outside the scrolling dialogue. Creation-only CSS keeps
both bars stationary, reserves space above the conversation and provides an
opaque theme surface so scrolling text cannot overlap controls. At desktop split
widths the toolbar contracts alongside the blueprint panel; other routes retain
their existing header positioning. Existing typography, icons and button styles
are reused; no new artwork is needed. Scroll and click checks at 320, 390, 760,
1024, 1050, 1100, 1440 and 2048px are recorded in
`screenshots/creation-header/verification.json` with screenshots of scrolled and
blueprint-open states. This is a functional layout correction, not a claim of
pixel parity with the source product.

## Generation recovery repair, 2026-10-27

The screenshot ending in `59312887` shows recovery buttons touching. Recovery
actions now form a wrapping flex group with a 12px gap and 44px minimum button
height, using the existing control styles. Scrolled layouts were checked at 320,
390 and 1440px; no artwork or shared button styles were changed.

Live configured-provider verification reproduced a single lecture reaching the
7,000-token output budget, followed by a complete response containing a trailing
JSON comma. That repair initially raised the course budget to 16,000 tokens.
The later output-limit fix removes application `max_tokens` for course requests
and continues exact fragments when the service signals truncation (up to eight
parts per request to bound faulty continuation loops). Each upstream call allows
180 seconds. This continuation has local API fixture coverage; it has not been
verified against the configured live model. The parser tolerates only trailing separators outside
quoted strings; it still rejects missing values, incomplete documents, multiple
results and invalid course structures. It never fills missing course content.
Newly generated lectures require their teaching script and quiz before saving.

Changed answers, materials or revision requests keep the previous plan and results
until a replacement plan validates. Generation cannot continue from the old plan
after a revision is canceled or fails. Paused previews no longer show a running
lecture. Non-application test scripts and build output are excluded from the dev
watcher so they do not reload and interrupt the page.

`qa:recovery` covers spacing, paused previews, canceled/failed revisions, changed
answers, retained content and malformed lecture responses. Actual provider
evidence is in `.local/generation-repair/`: the repaired response contains one
lecture with eight independent teaching fragments and a quiz. Its browser replay
uses an isolated workspace to verify SQLite persistence, reload and classroom
navigation. This does not claim a full live multi-lecture model run.

## Page Structure

| Surface        | Reference measurement / implementation target                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Navigation     | 240px white sidebar, 34px navigation rows, pale blue active surface                                          |
| Canvas         | #f9f9f9, content centered within the area beside the sidebar                                                 |
| Home           | Mode switch, centered heading, 1004px composer, quiet import strip, course tickets                           |
| My courses     | 1016px content: 620px course list, 76px gutter, 320px progress/discovery column                              |
| Course tickets | Exported reference SVG masks, illustrated covers, editorial course names                                     |
| Course detail  | 250px cover/metadata/unit column, view navigation and lesson timeline on the right; compact header on mobile |
| Marketplace    | Centered search and source tabs, illustrated featured collection, category filters and tickets               |
| Classroom      | Open board, optional outline, floating controls, right tutor conversation                                    |

UI typography uses locally hosted Satoshi and MiSans. Course names use EB Garamond
and ChillDuanHeiSong. The action color is #4c6696, text #0f1f33, selected fill
#e7eff8. EasyUI button feedback and shared tab indicators retain Motion animations
and Radix keyboard/focus behavior. Reduced-motion preferences are respected.

## Knowra visual refinement, 2026-10-27

The overall reference layout remains the baseline. The home ink sketch is an
original Knowra addition, drawing once beside the heading and responding to
composer focus. Inputs share a soft focus elevation; command buttons have an
inset highlight and 98.5% press feedback. Course cards rise 4px with a restrained
2.5% cover zoom on pointer hover. Radio choices reserve the check slot permanently
and animate the check only, avoiding line-wrap changes during selection.

`qa:visual` verifies stable focus/selection geometry, hover return and reduced
motion at 320/390/768/1440px. Screenshots and measurements are in
`screenshots/visual-finish/`. These are intentional adaptations, not reference
pixel-parity claims. Reference centering checks use the main-shell bounds so the
existing reserved scrollbar gutter does not masquerade as a 5px alignment error.

The authenticated generation conversation was inspected again on 2026-10-27.
Its entry animations use 300–400ms reveals, bounded choice staggering and a
short completion-check emphasis. Existing completed steps and source disclosures
were inspected; a new paid reference generation was not started. The source
view capture is `screenshots/hyperknow-source-motion-reference.png`.
Knowra adapts that rhythm with staged source/question reveals and drawn checks.
Its research network, planning branches and writing-pencil activity drawings
are original additions, tied to real request states rather than reference parity.
`qa:activity` uses isolated fixture workspaces to verify motion and state changes.

EasyUI's [catalog](https://www.easyui.site/components) was reviewed on 2026-10-27.
Spotlight Card, Morphing Button and AI Agent Activity are adapted from its exposed
MIT source, with attribution in `THIRD_PARTY_NOTICES.md`. Pointer illumination is
subdued ink blue on the existing light surfaces; buttons keep fixed dimensions;
the per-unit timeline reveals actual generated lessons or clearly marked planned
goals. These adaptations preserve the Hyperknow-inspired page composition.

## Asset Mapping

Source URLs are recorded in `public/reference/sources.json` and the collector
`scripts/reference-assets.mjs`. The navigation icons and ticket shapes were
downloaded/exported from the reference. The course artwork maps to corresponding
subjects: linear algebra, Python, cognitive psychology and AI. Custom courses keep
their existing local fallback cover. Reference account, credit, rating, enrollment
and private course content are not used as local product data.

## Evidence

Reference screenshots are in `screenshots/hyperknow-reference-*.png`. Local
desktop/mobile screenshots are in `screenshots/easyui-*.png` and
`screenshots/reference-local-*.png`.

Verify with `npm run build`, `npm run qa`, `npm run qa:detail`, `npm run qa:ui`, and
`npm run qa:reference`. The unified component and theme contract is documented in
`DESIGN_SYSTEM.md` and verified with `npm run qa:design`. The reference check measures the 240px sidebar, 1004px
composer, 290px home tickets, 620px course list and 320px right column; it checks
five main surfaces at six viewport widths. Chinese board lettering now uses a
locally hosted, subsetted Xiaolai 3.126 derivative (`Knowra Board Hand`) with
Virgil Latin lettering; MiSans remains a fallback for unsupported glyphs.
The workflow suites use isolated browser workspaces and fixture provider responses;
they do not establish real external AI availability or Hyperknow backend parity.

## Interaction Refinement

### Board notes and spoken explanation

The supplied 2026-10-27 Pinia classroom screenshot establishes the content split:
the left board holds concise definitions, keywords, relationships and examples;
the right conversation explains them with analogies, reasons and transitions.
Notes accumulate vertically on one board. This is a behavioral adaptation of
the screenshot, not a claim of identical fonts, pixel geometry or reference data.
It reuses existing local handwriting fonts, icons and annotation assets.

Built-in lessons now have separately authored board notes. Executable examples
retain valid cumulative code blocks, with explanations of their behavior.
Generated courses request `teaching.steps` containing `title`, `board` and
`narration`. Validation rejects incomplete scripts and verbatim duplicated fields;
the complete textbook remains available in reading mode. Older custom courses
without scripts retain their original content and use conservative extraction of
complete clauses for longer prose. They cannot acquire a fully authored lesson
script without regeneration.

Board writing and narration have separate durations and saved reveal progress.
The pencil follows actual board text, ending when the notes finish; the tutor can
continue explaining before the next step. Pause, reload and resume retain both
positions. Editing the source invalidates its old script. The playback signature
was revised for these new scripts; existing course completion records are separate.

`npm run qa:narration` checks script validation, independent timing and persistence,
accumulated notes, source edits, reading material and desktop/mobile rendering.
`screenshots/board-narration/` contains a disposable Pinia fixture and verification
data. `qa:lesson`, `qa:board`, `qa:pencil` and `qa:creation` cover the existing
playback, handwriting, annotations, pencil and creation flows. These are local
browser/fixture checks, not live-model output validation or reference-backend parity.

### Course generation

The authenticated reference's existing course-generation conversation was
inspected on 2026-10-27 in an agent-owned browser tab, including its background
questions, activity timeline, blueprint panel and final course handoff. No new
reference course was generated. The reference capture is
`screenshots/hyperknow-generation-reference.png`.

The follow-up screenshot defines an inline conversation with a user-request
bubble, topic-specific background/direction/outcome questions as selectable pills, real generation
events and an expandable blueprint. The default entry now opens `/create/:draftId`.
Free-text requirements and source documents accompany the preference questions.
The existing template/manual modal remains available as an alternative. Local
fonts, icons and tokens are reused; no new external visual assets are required.

Separate real requests implement the workflow. On a new topic, `course_search`
asks AI for up to three targeted queries; `/api/course-research` retrieves public
search results from a fixed search origin. It stores deduplicated source URLs,
titles, search excerpts, queries and retrieval time, then `course_questions`
uses those excerpts to generate 3–5 specific single-choice questions covering
existing knowledge, learning direction and a concrete final outcome. Sources
are expandable and labeled as search excerpts, not full-page reading. Failed
searches never fall back to a simulated questionnaire. Failed question requests
reuse the retained search results. Supplementary requirements can trigger a new
research round. No additional search API key is needed for the current public
search adapter; unavailable or changed search pages return an explicit error.

`course_plan` returns a proposed structure only after the answers are selected; explicit blueprint confirmation starts `course_unit` requests, one
unit at a time. Returned titles and lesson counts must match the approved plan;
each lesson requires separate board/narration scripts. Completion marks reflect
validated responses. Token counts and per-token streaming are not simulated. Failed revisions retain the previous valid blueprint.
Changing preferences or source files invalidates the previous blueprint.

Conversation drafts, research sources, generated questions, requirements, choices,
blueprint and completed units persist
in `courseDrafts`. History/sidebar links reopen the conversation. Stopping or
leaving aborts the active browser request. A fresh topic starts research automatically;
refreshing an interrupted research/generation request requires explicit continuation. Continuation generates unfinished units only. The final course is saved
once with its original materials, then offers course-detail and learning links.

| Scope                              | Evidence                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation composition           | `questions-1680.png`, `questions-390.png`, `blueprint-1680.png`, `ready-1680.png` in `screenshots/course-creation-chat/` |
| Responsive layout and controls     | 320, 390, 768, 1440 and 1680px geometry; single-choice arrow keys, IME-safe Enter and Shift+Enter in `qa:creation` |
| Real request contract and recovery | Fixture plan/unit requests verify confirmation gate, requirements/materials, cancellation, invalid output and revision failure; backend mock transport verifies stage prompts |
| Creation and persistence           | Partial-unit retry, interrupted refresh, no duplicate courses, source-file retention and classroom handoff in `qa:creation`; template/manual in `qa` |
| Research flow and recovery         | `qa:research`: automatic search/question order, failed search, invalid questions, source links, cached question retry, interrupted refresh, Vue/photography question fixtures and 320–1440px layouts |
| Live search retrieval               | `screenshots/course-creation-chat/live-research.json`: actual public search retrieval, separate from fixture AI responses |
| Shared surfaces                    | `qa:design`, `qa:ui` and production build                                                                                                      |

Automated regression checks use disposable workspaces and fixture provider
responses. A separate live smoke run on 2026-10-27 used the configured model
and public search adapter: query planning, retrieval of eight sources, and four
topic-specific questions all returned HTTP 200 without browser errors. The
questions distinguished Java/JavaScript background, project type, deliverable
scope and Vue depth. This verifies one live topic, not universal model/search
availability. Evidence: `screenshots/course-research/live-verification.json`
and `live-vue-1440.png`.

The authenticated reference was re-inspected on 2026-10-26 using an agent-owned
browser tab. Existing local artwork and fonts were reused; no new assets were
needed. Computed reference control transitions were 150-200ms; course description
and lecture-card expansion use approximately 300ms. The local 180ms indicator and
280ms disclosure are adaptations of that pacing, not claims of identical internals.

| Scope and State                | Local Behavior                                                               | Verification                                                       |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Home mode change               | Stable heading track and input position; draft preserved                     | 390px and 1440px geometry and screenshots                          |
| Suggestions and school hint    | Continuous open/close; exiting controls inert; hint scoped to course mode    | Intermediate-frame measurements and reduced-motion check           |
| Course description and lecture | Measured text expansion; lecture details and actions can collapse and reopen | Long-description fixture, desktop/mobile screenshots               |
| Profile edits                  | Draft name/goal, discard, saving, failure and retry; server-confirmed save   | Isolated SQLite workspace, injected failure and persisted readback |
| Model settings                 | Secret toggle stays inside input; fixed-width loading button; failure/retry  | Fixture configuration responses at 390/768/1440px                  |
| Backup feedback                | Export result, invalid-import recovery and mobile notification placement     | Browser download and invalid JSON fixture                          |

The settings states are local product improvements; the reference's settings
backend was not exercised. External AI requests are not part of interaction QA.

## Guided Classroom

The authenticated existing whiteboard was inspected on 2026-10-26. Its restored
session showed accumulated board writing, highlight/circle annotations, tutor
history and an inline question. It had already finished its teaching round;
no new AI generation or paid reference interaction was started. Evidence:
`screenshots/lesson-flow-reference.png` (private reference evidence only).

Re-inspection of the restored session and its existing history confirmed that
multiple knowledge areas coexist on the same 1/1 whiteboard. The page count is a
sheet count, not a knowledge-section count. Evidence is also in
`screenshots/reference-continuous-before.png` and `reference-continuous-focus.png`.

The local adaptation sequences the existing Markdown AST into paragraphs, list
items and cumulative code lines. One continuous board accumulates all revealed
sections, with stable two-column concept regions on a wide board and a vertical flow
on mobile. Sections advance continuously. Reviewing an earlier step retains all
written content; only an explicit replay clears the board. Tutor narration history
also accumulates. Previous/next step, 0.75-2x pacing and optional browser speech
remain available. Selecting text, asking the tutor, switching views or backgrounding
pauses playback. Step and speed persist independently of course completion; edited
content invalidates the saved step. The revealed board position persists too.
Full reading, notes, excerpts and quizzes remain
available. Tutor requests include the focused step only when explicitly submitted.

| State                    | Reference evidence                                 | Local verification                                                                    |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Multiple knowledge areas | Multiple regions on one 1/1 sheet                  | Advancing preserves the original section DOM; no section paginator                    |
| Review and resume        | Restored writing and existing conversation coexist | Earlier focus retains later writing; SQLite reload restores step and revealed content |
| Desktop/mobile           | Open board and separate conversation               | Concept regions use two columns when the actual board container is at least 900px; narrow boards stack |
| Focus and controls       | Zoom tools and current teaching region             | Current writing follows within the board; playback controls stay outside board zoom   |

This is content-driven guided playback, not a reproduction of Hyperknow's live AI
lesson engine or synthesized voice. Generated scripts can supply optional board
annotation targets. Verify playback with
`npm run qa:lesson`; real-clock screenshots are in `screenshots/playback/`.

The user's 2026-10-27 report identified board writing accumulating only on the
left. The implementation had an 820px, left-aligned, single-column surface.
The board now centers within a 1280px maximum; an actual content container of
900px or more supports two concept columns. Code, tables and
sections with existing visuals span the row. Supported visuals sit beside their
own board text on wide containers and below it on narrow ones. A one-section
lesson uses a centered 1040px maximum. Column placement depends on the full
lesson sequence so revealing the second section does not move the first one.
These are local layout decisions; no new illustration assets were needed.

`screenshots/board-layout/` records the built-in Python lesson and a generated
script fixture at 320/390/1024/1440/1920px, with geometry, overflow, zoom, tutor
collapse and reading-mode checks. The 1920px fixture, 1440px Python and 390px
fixture screenshots were visually reviewed. Pencil position, annotations,
continuous playback, pause/reload and the 11-route design checks also passed
after the layout change. This does not claim live-model course generation QA.
Speech pacing is coordinated with browser utterance completion; actual voice
quality and availability depend on the installed browser/OS voices.

The 2026-10-27 emphasis pass restores actual 700-weight board text, with local
weight synthesis for the regular handwritten font. Bold terms have no pill
background; selected conclusions receive the existing pale yellow Rough Notation
stroke after their writing segment finishes. Circle and underline targets remain
available. Optional `teaching.steps[].annotations` now survives course validation
and playback. Unsupported, duplicate or absent targets are ignored without
rejecting the lecture. Older notes use authored standalone bold conclusions as a
selective fallback; ordinary inline bold terms do not automatically get highlights.
The course-generation prompt requests selective emphasis without changing narration.

`npm run qa:emphasis` checks a normalized generated-script fixture, streamed bold,
delayed highlight, underline/circle, retained strokes, 320/390/1024/1440px layouts,
zoom, replay and reduced motion. Its 1440px and 390px screenshots in
`screenshots/board-emphasis/` were visually reviewed. Board effects, pencil,
narration, creation flow, the 11-route design checks, 41 course-contract tests,
54 backend tests and the production build passed. This is local fixture and
rendering evidence; live model selection of emphasis targets was not evaluated.

The following classroom pass binds optional `checkpoint` questions to individual
teaching segments. Multiple checks enter the continuous sequence immediately
after their prerequisites; unanswered checks stop playback and cannot be skipped.
Feedback precedes continuation. Answers survive a SQLite-backed reload and do not
overwrite the separate final quiz grade. Authored built-in checks cover concepts
such as vectors, matrices, tokens and shared state. Fresh multi-segment model
output must include a non-final understanding check or undergo the existing
automatic content-repair flow; legacy saved scripts retain their original quiz
placement. Checkpoints stay within their concept region rather than forcing all
sections into a single full-width column.

The whiteboard now supports unrestricted two-axis panning by pointer, wheel,
keyboard and touch. Its sticky tool strip switches hand/text selection and
recenters the current explanation. Direct manipulation pauses playback and
suppresses automatic following; resume restores the teaching view. Pointer
capture, cancellation, zoom compensation and interactive-control exclusions keep
dragging separate from answering, selecting text and manipulating existing labs.
Reading mode keeps normal document interaction.

`npm run qa:canvas` verifies two interleaved questions, wrong/correct feedback,
answer gating, persistence, final-grade isolation, dragging during playback,
wheel/keyboard/touch panning, zoom, text selection, recenter, replay and reading
at 1440/390/320px. Desktop and mobile screenshots in
`screenshots/classroom-canvas/` were visually reviewed. Board annotations,
streaming emphasis, pencil, narration, playback, course creation, 12-lecture depth
generation, 11-route design checks, 44 course-contract tests, 55 backend tests
and the production build passed. Model-generation checks use isolated fixtures;
live provider question quality was not evaluated.

## Active Classroom Walkthrough

The desktop tutor now floats above a full-width canvas rather than occupying a
second grid column. The inset card has its own scroll region, a close action,
Escape/focus restoration and a reduced-motion-aware collapse transition. Closing
keeps the mounted conversation and unsent composer text. The redundant tutor
identity/model header is removed; one integrated tab bar contains conversation,
learning goals and close. A shared underline indicator and subtle content fade
connect these views to the panel. Suggestions and the composer use softer surfaces.
The canvas viewport stays full width, while board content, notes and exercises
fit in the visible area beside the floating panel. Closing expands this content
area. HUD controls use the same inset, including at 140% board zoom.
Automatic camera following and recentering expose the current teaching block
outside the panel, while manual panning keeps the tutor stationary. Backward
navigation locates the current DOM block directly to avoid ref cleanup ordering
preventing camera follow.

Desktop-only evidence in `screenshots/floating-tutor/verification.json` covers
1024/1440/1920px widths, 1000px and 640px window heights, unchanged viewport widths,
collapse/expand/Escape, focus restoration, draft retention, independent chat
scrolling, HUD separation, current-question hit testing and canvas dragging.
The 1440px and 1024px screenshots were visually reviewed and the production build
passed. Mobile verification was not repeated for this desktop-scoped change,
following the user's verification preference. Additional screenshots and measurements
in `screenshots/tutor-refinement/` cover all accumulated board sections, notes,
exercises, tab transitions, draft retention and 140% zoom, plus 720px window heights.

On 2026-10-26, an agent-owned tab actively advanced the supplied authenticated
session through its 44 recorded narration segments, including the learner turns.
This was replay of an existing completed session, not a fresh run of its quizzes.
Local private evidence is in `screenshots/reference-flow/board-*.json` and
`segment-*.json`; reference course content must not become local course fixtures.

| Observed transition | Result                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Concept to example  | Narration can advance without adding writing; later actions append concise notes and code to the same sheet    |
| Code explanation    | An annotation targets the exact `:key` snippet in existing code                                                |
| Props explanation   | A highlight targets the existing single-direction data rule; a circle targets the declared prop types          |
| Checkpoints         | Questions occur at segments 10, 19, 26 and 34; recorded learner replies precede feedback and continuation      |
| Incorrect answer    | The final checkpoint is followed by corrective explanation and an additional board region about responsibility |
| Board accumulation  | Earlier regions remain; later material can occupy a fourth horizontal column while the sheet count stays 1/1   |

A new follow-up asking for a data-flow diagram was submitted through the visible
composer. Pause, resume and stop changed the live controls. After roughly two and
a half minutes, only the introductory response had arrived; the request was
stopped. No generated diagram or complete live teaching round was verified.
The hidden tab also failed to repaint/capture reliably during replay, so these
observations establish transitions and annotation targets, not frame-by-frame
drawing timing, speech synchronization or animation smoothness.

Implementation direction: narration, new writing, targeted highlights/circles,
questions and answer-dependent explanations need distinct teaching actions.
Existing material should remain addressable throughout the session. Meaningful
diagrams, comparisons and worked examples must follow the subject matter; the
the local adaptations and their limits are described below.

## Verified Local Teaching Fixes

Follow-up verification on 2026-10-26 found that the previous checks covered whole
step playback but did not establish streaming writing or an integrated checkpoint.
The local implementation now clips parsed Markdown by grapheme while retaining
valid formatting, code fences and previous code lines. Pausing stores the partial
writing position; replaying earlier steps preserves the furthest written content.
Only an explicit restart clears writing and the current teaching attempt.

Lessons with a quiz now stop at a checkpoint, wait for a submitted answer, show
the existing lesson explanation, and continue on learner action. Quiz results and
teaching answers persist independently of the explicit course completion control.
The Python values lesson includes authored narration, a name/object diagram,
number/string comparison, targeted annotations and a cumulative calculation trace.
These examples are tied to the exact built-in source; editing that source disables
the authored illustrations to prevent stale examples. Other lessons retain their
own content and receive structural writing and a final quiz checkpoint.

This remains local content playback with authored examples and optional browser
speech. It does not claim live AI diagram generation, reference voice parity or
execution of Python code. External tutor requests still require explicit input.

Verification: `npm run qa:lesson` exercises valid partial Markdown, graphemes,
continuous writing, pause/reload through SQLite, correct and incorrect answers,
checkpoint blocking, accumulated board content, tutor return on mobile, speed,
reading mode and reduced motion. Real-clock screenshots are in
`screenshots/playback/`, including `streaming-paused.png`,
`checkpoint-desktop.png`, `checkpoint-mobile.png`, `desktop.png` and `mobile.png`.

## Open-source handwriting and annotation refinement

The board now pairs existing Virgil Latin with a locally hosted Xiaolai 3.126
Chinese handwriting derivative. The upstream file is checked against its published
SHA256 before conversion. WOFF2 subsets retain all 44,871 supported codepoints:
built-in lesson characters load in a 170,684-byte face, common additional Chinese
in a supplemental face, and other characters on demand. The source, rebuild script
and OFL license are recorded in `THIRD_PARTY_NOTICES.md` and `public/fonts/board/`.

Rough Notation 0.5.1 (MIT) supplies actual animated SVG circles, highlights and
diagram boxes in place of CSS oval borders. Completed strokes keep their DOM
identity while narration advances. Font loading and layout changes reposition
strokes without replaying the entrance. SVG coordinates account for classroom
zoom, and decorations do not intercept selection or enter the accessibility tree.
Short annotated phrases stay together; reduced motion shows completed strokes.

Final acceptance scope includes the whole classroom: accumulated writing, code,
binding and comparison diagrams, checkpoint, tutor, player, reading view, excerpts
and notes. The `--font-board` token affects classroom prose, headings, companions
and diagram labels. Interface controls retain Satoshi/MiSans and code retains its
monospace face. No other typography token was changed.

| Object / state              | Intended adaptation                                                          | Rendered evidence                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Board prose and heading     | Local Chinese handwriting; existing 19px / 23px hierarchy                    | Chrome platform-font inspection, typography measurements in `screenshots/board-effects/verification.json` |
| Text circles and highlights | 420–650ms drawing; no repeated entrance during playback                      | Real SVG paths, retained node identity, text selection and replay cleanup in `qa:board`                   |
| Diagram boxes               | Thin double strokes; readable monospace values                               | `screenshots/board-effects/desktop.png` and `mobile.png`                                                  |
| Layout and zoom             | Align at 320/390/768/1440 CSS-pixel widths and actual 70–140% classroom zoom | SVG screen-coordinate measurements and overflow checks in `qa:board`                                      |
| Reduced motion / reading    | Static strokes; cleanup on replay and view changes                           | `qa:board`; accumulated playback and persistence in `qa:lesson`                                           |
| Whole affected classroom    | Preserve quizzes, excerpts, notes and responsive controls                    | `qa:detail`, `qa:lesson`, and all-route `qa:design`                                                       |

These are visual and local interaction adaptations. The authored demonstration
diagrams remain tied to the built-in Python lesson; this does not add live AI
diagram generation or an Excalidraw editor.

Streamed whiteboard text uses a Lucide pencil at the rendered text endpoint,
replacing the blinking caret. The pencil follows Markdown emphasis, wrapped
paragraphs, lists and code, with a small 420ms writing motion. Measuring the last
text range keeps the tip aligned after font loading, viewport changes and CSS
whiteboard zoom. It occupies no layout space and intercepts no pointer events.
Pausing, seeking, completing a block or switching to reading removes it; reduced
motion retains a static pencil while text advances. `npm run qa:pencil` checks
real-clock progress, endpoint alignment, wrapping, zoom, pause/resume, list/code,
completion and reduced motion using a disposable fixture course. Screenshots and
measurements are saved under `screenshots/writing-pencil/`.

## Course detail refinement within the original layout

The user-supplied defect screenshot showed the course sidebar: a blank rotated
publisher square, an extra cover badge, crowded navigation and inconsistent
alignment. Baseline captures are in `screenshots/course-detail/before-*`.
The existing course artwork was verified and reused; no new illustrations,
publisher logos, icons or external assets were needed.

The accepted scope is to keep the original layout and refine its details.
The desktop sidebar retains its square cover, vertical circular actions on the
cover's right edge, publisher text, course title, description and learning entry.
The dashboard, outline, materials and practice share one two-column tab group
below the course information, followed by the unit directory. Every item uses
the same icon treatment, hit area and animated selection surface. The unit
directory appears only in the outline view; returning to it retains the selected
unit. The page retains its visited height to prevent scroll clamping when this
directory disappears on mobile. The main column
starts with the unit heading, without a new top navigation bar. Existing artwork
is reused. The empty publisher diamond and redundant cover badge are removed.

Mobile retains the original 120px square cover beside the course information,
with compact 25px overlay actions and a contained horizontal unit list. Negative
directory margins are removed and number badges are centered. Short descriptions
omit the expansion control; longer text retains its smooth disclosure. Code,
icons and typography use the shared design system. `Cover` keeps its existing
shared-card defaults while this course view omits the extra badge.

The course sidebar follows normal document flow without a height cap or an
independent vertical scroll area. Publisher metadata sits on one compact row;
cover spacing, view navigation and directory rows use smaller vertical gaps.
Long course information remains reachable through the page's single vertical
scroll area. Desktop and short-window checks for the linear algebra course are
recorded in `screenshots/course-detail/sidebar-layout.json`.

| Acceptance scope           | Intended result                                                                                           | Evidence                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Artwork and source         | Original course image, no empty publisher square or extra cover badge                                     | `final-1440.png`, `final-390.png`; asset health and absent decoration checks       |
| Sidebar alignment          | Image, source, title and directory share a left edge; directory remains inside its parent                 | Rect measurements at 320, 390, 760, 768, 1024, 1050, 1100, 1440 and 1920px         |
| Units and actions          | Centered badges; circular actions remain inside the square artwork                                        | `verification.json`; original 32px desktop and 25px mobile targets                 |
| Original composition       | Dashboard and tabs remain in the sidebar; main column starts with unit content                            | Structural assertions and desktop/mobile captures in `qa:course`                   |
| Header and view navigation | Main-column material actions avoid the global header                                                      | Upload action hit testing; dashboard, tabs and keyboard operations                 |
| Four content views         | Outline, dashboard, materials and practice remain usable                                                  | Screenshots and `npm run qa:course`; local join-to-classroom flow                  |
| Existing workflows         | Long summaries, lecture expansion, mastery, projects, notes and original file downloads remain functional | `qa:interactions`, `qa:detail`; shared UI/assets in `qa:design` and `qa:reference` |

The supplied Hyperknow course-detail screenshot defines the refined composition:
a compact 250px course column, an unboxed mastery legend and learning path,
an inline next-lesson pill, and one dashed timeline joining lectures, the stage
project and the unit assessment. Lecture titles include their sequence number;
mastery controls and animated detail disclosures remain available. Course copy,
original cover artwork and existing learning workflows come from local course
data. No reference-only resources or links are fabricated. Mobile stacks these
columns while keeping timeline markers aligned. Final screenshots and measured
geometry are in `screenshots/course-detail/`.

The follow-up recheck also fixes unit navigation: selecting a directory item,
opening a unit from the dashboard, or using the footer's next-unit button reveals
and focuses the new heading. The scroll inset accounts for the desktop header;
reduced motion skips smooth scrolling. The next-lesson link follows the selected
unit's unfinished lessons instead of jumping back to another unit. The overview's
main learning entry continues to follow overall course progress. This is checked
through actual desktop/mobile navigation and a selected-unit classroom entry in
`qa:course`, with `selected-unit-mobile.png` as visual evidence.

In the stacked layout, course tab switching retains the tallest visited panel
height at the current width, recalculating after responsive width changes and
resetting for a new course. Desktop instead uses the bounded right scroller
described below.
This prevents shorter material views from clamping an already scrolled document.
The stable outer content wrapper owns this height; the keyed inner panel owns its
header inset and opacity transition. Legacy slide animations are disabled inside
that panel. Short alternate views stay in view within the retained space, keeping
the materials heading and upload action reachable after a scrolled switch.
Root scrollbar space is reserved and mobile grid rows stay aligned to
the start, so scrollbars and leftover row space cannot shift the navigation.
`npm run qa:course-tabs` samples outline/material switches at six widths with
normal and reduced motion, asserting unchanged scroll position, document height,
tab coordinates and content width. Evidence is in
`screenshots/course-tab-motion/stability.json`.

## Sidebar navigation motion

Sidebar route changes use a 240ms opacity transition on the keyed content wrapper,
with a 320ms decorative progress line at the top of the content area. The sidebar
and global header persist. No translate, height animation, outgoing-page wait or
artificial data-loading delay is introduced. Reduced motion renders the new page
immediately and omits the progress line. `qa:navigation` verifies the six sidebar
destinations on desktop/mobile with normal/reduced motion, frame-sampled opacity,
stationary layout, rapid navigation and browser history. Captures are saved in
`screenshots/navigation-motion/`.

## Immediate help conversation refinement

The supplied conversation screenshot identifies readability and composition
problems rather than a new external design to replicate. This refinement reuses
Knowra's shared neutral surfaces, blue accent, fonts, controls and Lucide icons.
No new external assets or dependencies are required.

The conversation has a bounded reading column, right-aligned question bubbles,
unboxed tutor answers with clearer headings, full-width tables and contained code
blocks. The message viewport scrolls independently, keeping the composer visible
without covering the answer. The top conversation title is removed. The composer
starts as a compact single-line input and grows with its draft up to 180px.
Attachments and new-chat controls sit on the lower left; the current model links
to settings beside a circular send/stop button. Quiet format and keyboard hints
sit below the rounded input rather than competing with its text area.
New conversations immediately show the submitted question and waiting state.
Answers support copying and exporting Markdown. New-chat suggestions focus the
input, and reduced motion bypasses message entrance animations.

`npm run qa:assistant` checks the actual rendered page at 320, 390, 768, 1024,
1440 and 2048px, plus a 320x640 viewport with long URLs, wide tables and code.
It verifies copy/export, attachment removal, IME-safe Enter, Shift+Enter,
bounded input growth, request cancellation, failure draft recovery and new-chat
creation. AI responses and provider state in this suite are fixtures, not live
model verification; workspace persistence uses a separate test workspace.
Screenshots and measured geometry are in `screenshots/assistant/`.
`qa:design` covers the shared UI across all eleven routes at desktop/mobile sizes.

## Global header and contextual mathematics demonstrations

The Shell header is fixed across all workspace routes, with its shared height
reserved by the main content. Sidebar width and header height variables also
drive the course-creation layout. Search and notifications stay above scrolled
content; the navigation progress line remains above the header. The immersive
classroom continues to use its own stationary toolbar.

The previous standalone vector laboratory is replaced by compact demonstrations
attached to four authored linear-algebra teaching segments. Their presets match
the adjacent notes: scalar multiplication, diagonal scaling, area scaling and
an eigenvector. They appear when the relevant segment is written, animate with
its progress, pause playback when manipulated, and restore the lesson preset on
resume. Unrelated lessons have no appended laboratory. This is authored lesson
coverage, not evidence of automatic diagram generation by a live model.

Desktop browser checks cover nine Shell routes at 1024, 1440 and 1920px, header
position before/after scrolling, search, content spacing and the assistant
composer. Classroom checks cover the four presets, unrelated lessons, replay,
pause/resume, negative and zero factors, and reduced motion. Captures and local
fixture measurements are saved in `screenshots/header-teaching/`. Existing tab
and navigation suites accept `--desktop` for focused desktop verification.

## Collapsible navigation and board typography

The desktop sidebar closes completely via a control beside the brand and opens
again from the fixed header. Its hidden contents are inert; focus moves between
the two controls. A shared sidebar-width variable keeps the main content, header,
route progress and fixed course composer aligned during the 220ms transition.
Reduced motion removes the transition. Compact desktop retains its existing
drawer without changing the saved desktop preference.

The board toolbar offers handwritten, sans-serif and serif styles, each with an
actual local-font preview. Only board headings and prose inherit the chosen
family; interface controls and code keep their own typography. Choosing a style
preserves playback and text emphasis. Both appearance preferences use workspace
persistence. `qa:appearance` covers 1440/1920px with normal/reduced motion, a
1024px drawer round trip, route/composer offsets, refresh, keyboard selection,
font loading, highlights, and changes during playback. Screenshots are stored
in `screenshots/workspace-appearance/`; provider state is a local fixture.

## Adaptive classroom teaching

Questions use the current board, displayed teaching history, checkpoint answers,
remaining plan and reference materials as context. A structured `classroom_adapt`
response separates the direct reply, teaching plan, board notes and spoken
explanation. Follow-ups insert teaching segments; an explicit change of direction
can replace the unseen remainder. Stable step identities retain existing board
elements and checkpoint answers. Help during an unanswered checkpoint is inserted
before it, then returns to the same question. Original reference reading remains
available alongside the added notes.

The tutor interleaves each question and its plan before the associated narration.
Validated updates play through the existing pencil, progressive writing, emphasis
and embedded-checkpoint interactions. This is progressive client presentation
after a complete model response, not provider token streaming. Invalid structures
receive up to three internal repair attempts; cancellation and exhausted repair
leave the board unchanged. Revisions persist with the workspace and reload paused.

`test:classroom` covers composition, cursor rebasing and response validation.
`qa:adaptive` covers 1440px normal motion and 1920px reduced motion, existing DOM
retention, new writing and narration, question/plan chronology, checkpoints and
follow-up help, replanning, saved answers, refresh, cancellation, repair and lesson
isolation. Evidence is in `screenshots/adaptive-classroom/`. Responses are browser
fixtures; persistence uses an isolated real local workspace. Live model quality
and arbitrary generated diagrams are not established by these checks.

## Caption and question stage

The user-provided Hyperknow screenshot establishes the interaction direction:
current spoken captions at the foot of the canvas, with answer chips directly
under a checkpoint question. The old boxed player, step count and progress rail
are removed. A compact play/pause control remains above the board; secondary
controls are grouped in the board settings panel described below.

Captions reveal the current clause character by character using the narration
playback clock. Pause freezes the text; resume and speed changes preserve its
position. Grapheme segmentation keeps emoji intact. An invisible layout reserve
prevents typing from shifting the stage, and assistive technology receives whole
clauses instead of repeated character announcements. A question replaces the caption and pauses progression. Clicking
an option or activating it with the keyboard immediately records the answer and
reveals feedback; a continue action resumes teaching. Checkpoint cards are no
longer duplicated across board notes. The tutor's answer link focuses the first
option. The stage sits outside board pan/zoom, reserves the tutor overlay width,
and reports its height to the scroll area to accommodate longer questions.

The visual interpretation uses existing Knowra fonts and tokens: 15px captions,
centered 1.9 line height, wrapping pill options, subtle translucent backing and
180ms content transitions (disabled under reduced motion). These dimensions are
implementation choices inferred from the reference, not verified source values
or a claim of pixel parity across two different products and lessons.

`qa:lesson-stage` checks real desktop rendering at 1024/1440/1920px, caption
advancement and pause, direct keyboard answers, correct/incorrect feedback,
SQLite persistence and reload, resume, tutor collapse and reading mode. Captures
and measured stage/panel geometry are in `screenshots/lesson-stage/`.
`qa:adaptive` also verifies follow-up teaching before a checkpoint with this UI.

## Board settings and toolbar simplification

The fixed classroom header now exposes a single Board Settings control alongside
the tutor toggle. Its anchored panel groups view mode, font previews, zoom, speed,
spoken narration, previous/next, replay, excerpts and Markdown download. The board
toolbar retains only play/pause and the three canvas tools. Settings are portaled
outside the scaled document; changing zoom does not resize the panel. Font/rate
persistence and the existing partial-playback cursor are retained.

The panel supports keyboard access, nested font/rate selects, outside dismissal,
Escape and focus return. It uses a 180ms opening transition, with reduced-motion
support. Its own icon buttons use native titles so tooltip exit layers cannot
intercept the first Escape after a quick view change. Playback can continue while
previewing fonts. The board remains mounted when opening notes or practice, so
settings stay available across these floating views.

`qa:board-settings` covers 1024/1440/1920 desktop widths, normal/reduced motion,
toolbar simplification, nested selections, zoom isolation, playback continuity,
font/rate persistence, views, excerpts, download and keyboard/focus behavior.
Captures and geometry are saved in `screenshots/board-settings/`. The subtitle,
adaptive teaching and desktop playback suites use the same settings entry point.


## Full viewport classroom canvas

The entire desktop viewport is the canvas. Its scroll viewport has no header or
assistant padding, and the board document uses the same width regardless of
overlay state. The immersive route removes the global scrollbar gutter; leaving
the classroom restores the normal page gutter.

Toolbar controls and the subtitle stage are portaled outside the scaled/panned
document. Transparent gaps in the header remain draggable. The AI assistant
starts collapsed; opening it or the outline does not reflow board columns.
Following the current explanation can pan content around the assistant, while
manual panning keeps control with the learner. Notes and practice are dismissible
floating panels: opening them pauses teaching without remounting the board,
Escape restores focus to the board tab, and notes retain normal persistence.

`qa:full-canvas` checks 1024/1440/1920 desktop viewports, including reduced motion,
exact canvas bounds, transparent hit areas, independent tools, pan/zoom, unchanged
board geometry, retained DOM identity, pause-on-open, notes and route cleanup.
Evidence is in `screenshots/full-canvas/`. Desktop subtitle, settings, adaptive
teaching and playback suites also passed with the shared overlay layout. These
checks use seeded lessons and fixed AI responses; they do not assess live model
teaching quality.


## Canvas wheel zoom

Ctrl-wheel over the whiteboard changes only canvas zoom, preventing browser
zoom for that gesture. It works in both pan and text-selection modes and
normalizes pixel/line/page deltas; fractional percentage changes accumulate for
high resolution wheels. Zoom remains within the settings range of 70–140%.
Settings buttons clamp their increments when starting from a wheel-derived
percentage.

The canvas hook records a local pointer coordinate and compensates its transform
after CSS zoom and scroll clamping, retaining the pointer anchor after panning.
Zoom keeps teaching running and temporarily suspends camera following until two seconds after the last canvas interaction.
Plain wheel panning, floating controls and subtitle geometry remain independent.
`qa:canvas-zoom` uses trusted Chrome Ctrl-wheel input at 1024/1440 desktop widths
and supplemental synthetic small-delta events. It checks pointer anchoring,
limits, text-selection mode, browser-scale isolation, settings synchronization,
normal wheel panning and pause behavior. Evidence is in `screenshots/canvas-zoom/`.


## Fixed desktop course column

At desktop widths the course detail grid fills the viewport below the global
header. The left identity, actions, view tabs and progress stay in place; the
right content column owns vertical scrolling with stable scrollbar space and
contained overscroll. Short viewports reduce cover size and vertical spacing to
keep the directory and progress visible. Only a long unit directory scrolls
inside the left column; expanded descriptions also have a bounded reading area.
The entire sidebar does not scroll.

Changing units focuses the heading without scrolling ancestors and moves only
the right column to its top. Switching content views also starts that scroller
at the top while retaining the existing opacity animation. Stacked layouts keep
the prior document-height preservation behavior. No page-wide overflow lock is
used, and other routes retain normal scrolling.

`qa:course-scroll` verifies 1920x1000, 1440x900, 1440x768 and 1024x844 desktop
viewports, fixed left/header geometry during real wheel input, stable view tabs,
unit focus/reset, schedule dialog, a 20-unit directory and route cleanup. Captures
and measurements are in `screenshots/course-scroll/`. `qa:course-tabs -- --desktop`
also passes normal/reduced motion checks for 1024/1440/1920 widths. These use
disposable local workspaces and seeded course data.


## Bounded-height continuous board columns

The teaching board fills each column from top to bottom, then continues to its
right on the same pannable canvas. The column height adapts to the viewport
within 440–720px, reserving space for floating tools and subtitles. CSS columns
use fixed-height auto fill instead of balancing, so adding writing does not
redistribute prior blocks. A long section can continue across multiple columns.

Headings stay with their following content; short teaching blocks, diagrams,
code and table rows avoid column breaks where they fit. Very long code scrolls
inside a height-bounded block. Reading mode remains continuous vertically.
Opening the floating tutor does not change board geometry. Recenter measures
the current block once and applies one transform, aligning the column origin
vertically and keeping the active block clear of the tutor. Native scroll
anchoring is disabled to avoid competing with canvas positioning.

`qa:board-flow` advances a seeded long section through the real player at
1440/1920/1024 desktop widths, including reduced motion. It checks retained DOM
identity and earlier positions, height limits, rightward reading order, whole
short blocks/code/table, long-code overflow, tutor isolation, recenter and
reading-mode switching. Evidence is in `screenshots/board-flow/`. Playback,
adaptive teaching, full-canvas, settings and zoom regressions also passed.
These checks use disposable local workspaces and controlled model responses;
they verify layout and interaction rather than live model teaching quality.


### Fill text before moving a diagram

A visual teaching block is fragmentable between its writing and its diagram.
The writing and diagram each remain whole where they fit, while a short
preceding section and the next example heading/text can share a column.
Keeping the entire text-plus-diagram grid atomic previously moved a roughly
588px example to the next column after only 202px of earlier notes. The matrix
regression now checks that both headings stay in the first column, with only
the diagram moving right when the remaining height is insufficient.

Following and recentering measure the writing fragment during writing and the
diagram fragment afterward, instead of the bounding union of multiple columns.
The active text marker also stays with its writing rather than stretching into
empty column space. `qa:board-flow` covers the real catalog matrix lesson at
1024/1440/1920 desktop widths, including recentering clear of the floating tutor.


## Non-interrupting canvas exploration and idle return

Pan, native text selection, wheel/keyboard movement, zoom and vector controls
leave teaching playback running. Only explicit playback actions, checkpoints
and existing teaching panels control lesson pauses. While exploring, step
changes do not reset the camera. Holding a drag disables the return timer;
release starts a two-second idle interval. Each subsequent canvas operation
restarts that interval. The callback resolves the latest current block rather
than a block captured before exploration.

Idle return preserves zoom, respects the floating tutor and uses a 360ms camera
transition, or no transition for reduced motion. A new gesture interrupts the
transition at its current visual position. Explicit pause stays paused after
return. Timers and animations are cancelled on leaving board mode or unmount.
`qa:canvas-follow` uses real-clock local browser checks at 1440 and 1024 desktop
widths with normal/reduced motion, including a step transition during a held
drag, idle threshold, repeated-wheel timer renewal, Ctrl-wheel, selection,
keyboard, preserved pause and route cleanup. `qa:canvas-zoom` also verifies
uninterrupted teaching with trusted browser wheel input.


## Commit column flow after writing finishes

A growing teaching block stays in its starting column even after crossing the
column height. During output it is a monolithic inline block with a minimal
flow footprint and visible vertical overflow. Completion restores normal
column layout. Partial pauses keep the output state and position. Consecutive
code-line steps share this pending state until the final line is written,
retaining their existing DOM identity. Completed blocks retain normal diagram
and text fragmentation rules.

The camera observes the writing content rather than the minimal wrapper.
Overflow reserves scroll space below the latest line for subtitles, while
manual/idle recenter targets the current output, preserving zoom and pause.
`qa:writing-flow` checks stable column/position beyond the height limit, pause,
DOM retention, completed flow and whole-code completion at 1440/1024 desktop
widths. A fresh real-clock context separately checks native smooth-scroll
clearance and the two-second idle return, since browser compositor scrolling
does not advance reliably under the mock clock. Evidence lives in
`screenshots/writing-flow/`.
