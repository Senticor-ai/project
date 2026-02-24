# Gotchas & Pitfalls

Things to watch out for in this codebase.

## [2026-02-24 10:53]
Tooltip tests must hover the wrapping span (.closest('span')!), NOT the button itself. The Tooltip component renders a wrapping span with className='inline-flex' that receives the mouse events.

_Context: When writing tooltip integration tests in ActionRow.test.tsx, ProjectTree.test.tsx, AppHeader.test.tsx_

## [2026-02-24 10:53]
ProjectTree stalled indicator needs explicit label prop: <Tooltip label='Needs next action'> because the aria-label on the child ('Needs next action') may match but the Tooltip should be explicit here since it's a span with role='img', not a button.

_Context: When implementing Tooltip integration in ProjectTree.tsx subtask-3-1_
