# Knowra UI System

## Current visual direction: watercolor-style

The user-provided Watercolor Style brief is the current visual contract.
Use warm paper (#faf8f5), ink blue (#4a6fa5), and transparent peach (#e8a87c),
teal (#85cdca), rose (#c38d94) and ochre (#d4a373) washes. Editorial headings
use the bundled EB Garamond / ChillDuanHeiSong; interface and code retain
readable sans/mono faces. Preserve the learner's whiteboard font choice.

`src/design/watercolor.css` is the final appearance layer: paper grain,
translucent surface treatments, soft 16–24px corners, restrained shadows and
shared form/popup states. It must not alter route scrolling or canvas geometry.
Theme colors, spacing and component radii continue to come from `tokens.css`.
Pigment stays mostly at the edges of reading areas. Reuse course art, preserve
knowledge highlights and status semantics, and never blur text or controls.

Buttons use a 1.02 hover / 0.98 press scale; color and shadow transitions use
400ms ease-out. Respect reduced motion, visible keyboard focus, and AA text
contrast. Avoid pure black backgrounds, harsh outlines, sharp panel corners
and saturated decorative colors. Loading, errors, disabled and success states
must remain recognizable. Do not animate the entire route shell.

Desktop verification: `node scripts/qa-watercolor.mjs` covers all 12 routes,
normal/reduced motion, keyboard focus, task-calendar dialogs and whiteboard
settings/font/tutor overlays. Course scrolling and whiteboard flow have their
own regression scripts. See `screenshots/watercolor/verification.json`.

All application controls use the owned shadcn components in `src/components/ui/`.
Radix provides keyboard navigation, focus management and popup behavior. Motion
provides button feedback, shared tab indicators, dialog entry and progress updates.
Business components compose this foundation for course tickets, calendars and
classroom content.

## Entry Points

- `components.json`: shadcn registry configuration, React JSX and Tailwind v4.
- `src/design/primitives.jsx`: application adapters for Button, ButtonLink,
  IconButton, Field, Input, Textarea, DataTable and empty/loading states.
- `src/design/tokens.css`: the sole theme definition for color, typography,
  spacing, control dimensions, elevation and motion durations.
- `src/lib/motion.js`: shared Motion transitions. Respect reduced motion.
- `src/components/ui/disclosure.jsx`: controlled, animated disclosure content;
  exiting content becomes inert immediately and is removed after the transition.
- `src/components/ui/inline-status.jsx`: persistent feedback space for pending,
  success and failure states. `PasswordInput` composes the shared input and tool button.
- `src/design/tailwind.css`: the only application stylesheet entry point.

## Stylesheet Ownership

| Sheet           | Responsibility                                                                |
| --------------- | ----------------------------------------------------------------------------- |
| `fonts.css`     | Local font faces                                                              |
| `base.css`      | Reset, inherited typography and accessibility defaults                        |
| `layouts.css`   | Business structure, responsive behavior, print and study content              |
| `workspace.css` | Shared workspace compositions and business states                             |
| `shadcn.css`    | Shared component integration                                                  |
| `pages.css`     | Hyperknow reference compositions for home, courses, marketplace and classroom |
| `blueprint.css` | Scoped course blueprint panel, diagram viewport and course preview            |
| `states.css`    | Shared interaction states following page composition                          |
| `watercolor.css` | User-specified watercolor appearance and accessible theme states             |

The previous `styles.css`, `refinements.css`, `polish.css`, `components.css`,
`easyui.css` and `course-reference.css` are retired. Their active layout rules
were consolidated; obsolete selectors and overridden declarations were removed.
Do not restore these files as another visual override layer.

## Component Rules

- Use `Button` for commands, `ButtonLink` for styled navigation and `IconButton`
  for compact tools. The `surface` variant supports multiline business items,
  calendar dates and quiz options while sharing focus, disabled and press states.
- Use Radix-backed `Tabs`, `Select`, `Checkbox`, `Slider`, `Dialog`, `Sheet`,
  `DropdownMenu` and `Tooltip` for their corresponding interactions.
- Keep invisible native file inputs for uploads. Visible native controls belong
  only inside the owned UI primitives.
- Application styles use semantic CSS variables. Add theme values to tokens;
  do not introduce another root palette, generic button implementation or tab
  indicator. Page sheets may define business geometry and reference composition.
- Interface text uses Satoshi and MiSans (400, 600, 700). Editorial course names
  and board lettering have explicit roles. Font assets must be valid local WOFF2.
  Classroom lettering pairs Virgil with the OFL Xiaolai derivative `Knowra Board
  Hand`. Its subsets and licenses live in `public/fonts/board/`; rebuild using
  `scripts/subset-board-font.py` and validate actual glyph use with `npm run qa:board`.
  Board circles, highlights and diagram boxes use Rough Notation with owned SVG
  cleanup, classroom zoom correction and reduced-motion support.
- Charts use semantic tokens too; success and warning colors remain distinct from
  primary actions. Course artwork retains its content with a light saturation reduction.
- Keep the route shell visible and stationary. Reset scroll before paint;
  do not replay an opacity/translation entrance for the entire page.
- Tabs use the 180ms indicator transition; disclosures use the 280ms content
  transition. Animate the affected region and respect reduced motion.
- Composer headings share a grid track so changing mode cannot move the input.
  Preserve drafts, grow long input within 240px, and keep course-only hints out
  of assist mode.
- Profile name and daily goal are edited together, can be discarded, and show
  success only after workspace synchronization. Provider success means its PUT
  succeeded, not that external model availability has been tested.
- Loading icons retain the same SVG dimensions and button padding as idle icons.
  Inline feedback must not resize the command or disappear on a failed request.
- Classroom progression belongs to `lesson-sequence.js` and `useLessonPlayback.js`.
  Parse Markdown structurally; preserve lists, code, tables and references. Stream
  text by grapheme without breaking Markdown, and retain previous code lines and
  previously written content during review. Pause at quiz checkpoints until the
  learner answers, then show the lesson explanation before continuing. Authored
  narration and visual examples must match the current lesson source. Reveal
  steps without animating the route shell. Keep playback controls outside board
  zoom, respect reduced motion, and never treat playback completion as mastery.
  Knowledge sections accumulate on one board; they are not slides. Keep previous
  writing mounted while progressing or reviewing, persist the revealed extent,
  and clear it only on an explicit replay. Section boundaries do not force pauses.

## Visual character and motion quality

The front end must feel distinctive at first glance and carefully finished in use.
Keep the established course, classroom and conversation layouts. Use the existing
paper background, ink blue, local interface/editorial/handwriting fonts and course
artwork; the home learning sketch is an owned SVG illustration, with no external
asset dependency. It draws once and becomes slightly clearer on composer focus.
It is decorative, hidden from assistive technology, and removed on narrow screens.

Spend motion on the person's action: cards rise 4px on hover, command buttons
compress to 98.5% on press, trailing arrows advance 2px, and selection checks
appear inside a permanently reserved slot. Do not add continuous floating,
spinning or pulsing to idle content. Keep option positions, form bounds, sidebar
and route geometry stable. Shadows convey focus and surface depth; do not grow
control dimensions or swap border widths for emphasis. Reduced motion renders
the settled illustration, omits card transforms and makes state changes immediate.

Review screenshots at desktop/mobile sizes as well as behavior. `npm run qa:visual`
checks the focus/hover/selection sequence with normal and reduced motion at
320/390/768/1440px. Evidence lives in `screenshots/visual-finish/`.

Course creation uses owned SVG activity drawings for real research, planning and
writing requests. The drawing runs only while its request is active, visible in
the viewport and the document is visible. Pause, error, completion and reduced
motion render static drawings. Unit markers reflect validated returned units;
never advance them on a timer. Sources and question groups enter in a short,
bounded sequence, and completion checks draw once. Preserve the conversational
layout and reserved selection geometry. `npm run qa:activity` covers all stages,
stop/retry/late responses and 320/390/768/1440px with fixture provider responses.
Evidence is in `screenshots/generation-activity/`.

### EasyUI component use

Use the [EasyUI catalog](https://www.easyui.site/components) as an implementation
source for suitable motion components, alongside the shared shadcn/Radix controls.
Inspect the preview and source before adapting a component. Keep its MIT notice,
replace demo colors/fonts with Knowra tokens, retain semantic elements and keyboard
behavior, and connect async effects to real application state. Keep each reusable
adaptation in `src/components/ui/`; do not create parallel native control systems.

- `SpotlightSurface`: home, assistant and generation composers, plus the course
  blueprint. Pointer tracking uses MotionValues, not React renders per frame.
  Decorative layers ignore input events and do not affect layout; touch and
  reduced-motion users retain the existing static focus treatment.
- `MorphingAction`: stable button dimensions across planning, retry and blueprint
  confirmation. Reserve all labels in one grid cell; separate the accessible action
  name from decorative transitioning content. Disable repeated busy submissions.
- `AgentActivityItem`: real per-unit status and expandable generated lesson results.
  Pending items explicitly label their content as planned goals. Expansion uses
  shared buttons, `aria-expanded` and the reduced-motion-aware disclosure primitive.

`qa:visual` verifies pointer tracking, settled reduced motion and unchanged geometry
on all three composer surfaces. `qa:activity` verifies button dimensions across
states, keyboard timeline disclosure, and actual result counts. Shared-surface
regression includes `qa:design`, `qa:ui`, `qa`, `qa:detail`, `qa:reference`,
`qa:creation` and `qa:assistant`; these checks establish adaptation behavior,
not pixel parity with EasyUI's dark showcase.

## Verification

Run `npm run build`, `npm run qa:design`, `npm run qa:ui`, `npm run qa`,
`npm run qa:detail` and `npm run qa:reference` after shared UI changes.
Run `npm run qa:interactions` for profile persistence/retry, provider feedback
with a fixture, secret visibility, stable composer modes, disclosure transitions,
long text, reduced motion and backup recovery. Evidence is in
`qa-interactions-results.json` and `screenshots/interactions/`.
Run `npm run qa:lesson` for cumulative content, continuous progression, pause, code lines,
SQLite resume, speed, tutor interruption, reading mode and mobile playback. Timer
tests use a fake clock; visual evidence uses a separate real-clock browser context.

The design check verifies shared control ownership, local fonts and assets,
theme propagation, notification dismissal, mobile focus trapping and keyboard
tabs. It captures all 11 routes at 390px and 1440px under `screenshots/unified-*`.
The reference suite covers the five primary surfaces at six viewport widths.
Workflow suites use isolated browser workspaces and fixture AI responses.

Use `node scripts/sync-reference-fonts.mjs` to verify and restore the declared
MiSans subsets from the source recorded in `public/reference/sources.json`.

### 课程详情导航与独立练习（2026-10-28）

本次参考范围为用户提供的课程详情左栏截图：上方低强调“面板”入口、分隔线、单行“单元 / 资料 / 练习”、带数字的圆角单元目录。保留现有课程封面、全局导航、固定左栏和右栏滚动结构；只在“单元”下展示单元列表。标签使用现有 Radix / Motion 指示条和淡入，避免位移引起页面抖动。资源清单：复用 Lucide 的列表、文档、铅笔图标和现有字体、颜色 token；参考裁切区域无须引入外部位图，不以占位图模拟设计资源。

独立练习采用同一组件连接课程详情与课堂浮层，拥有单独题库、草稿、提交及自评记录；课堂理解检查继续属于教学序列。桌面截图、布局和交互证据保存在 `screenshots/course-practice/`。此范围不宣称整页逐像素复刻，也不包含移动端验收。
