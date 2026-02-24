# Specification: Add Tooltip Component and Integrate Across UI

## Overview

This task resolves PR #34 (`feat/tooltip-and-component-improvements` → `main`), which introduces a new reusable `Tooltip` component to the frontend design system and integrates it across all icon-button actions in the application. The Tooltip component uses a portal-based rendering approach with intelligent positioning (auto-flip from top to bottom), delay-based show/hide, and automatic `aria-label` derivation from child elements. It is integrated into 5 existing components: `ActionRow`, `ProjectTree`, `ReferenceRow`, `AppHeader`, and `ChatInput`. The PR also includes secondary changes: a new product MDX doc (`EpicEmailPreviewEnhancements.mdx`), `.gitignore` cleanup, coverage report updates, and a `.claude/settings.json` permission addition.

## Workflow Type

**Type**: feature

**Rationale**: This is a new reusable UI component (Tooltip) being added to the design system with broad integration across the existing component tree. It adds new user-facing functionality (visual tooltip hints on icon buttons) without changing existing business logic.

## Task Scope

### Services Involved
- **frontend** (primary) - New Tooltip component creation, integration into 5 components, tests, stories, and a product doc

### This Task Will:
- [ ] Create a new `Tooltip` component (`frontend/src/components/ui/Tooltip.tsx`)
- [ ] Create unit tests for the Tooltip component (`Tooltip.test.tsx`)
- [ ] Create Storybook stories for the Tooltip component (`Tooltip.stories.tsx`)
- [ ] Integrate Tooltip into `ActionRow` (complete, focus, notes, edit, move buttons)
- [ ] Integrate Tooltip into `ProjectTree` (show all, create, stalled indicator, archive, rename, star buttons)
- [ ] Integrate Tooltip into `ReferenceRow` (notes, external link, view file, download, actions, markdown view/edit buttons)
- [ ] Integrate Tooltip into `AppHeader` (chat toggle button)
- [ ] Integrate Tooltip into `ChatInput` (send button)
- [ ] Add tooltip integration tests in `ActionRow.test.tsx`, `ProjectTree.test.tsx`, and `AppHeader.test.tsx`
- [ ] Add new MDX product doc `EpicEmailPreviewEnhancements.mdx`
- [ ] Update `.gitignore` (remove auto-claude entries)
- [ ] Update `.claude/settings.json` (add git pull permission)
- [ ] Clean up coverage report files (remove old HTML coverage artifacts)

### Out of Scope:
- Backend changes (no API modifications)
- Email preview feature implementation (the MDX doc is planning-only)
- i18n key additions (Tooltip derives text from existing `aria-label` attributes)
- Changes to the `Tooltip` positioning algorithm beyond what the PR specifies

## Service Context

### Frontend

**Tech Stack:**
- Language: TypeScript
- Framework: React 19
- Build Tool: Vite
- Styling: Tailwind CSS v4
- Component Library: shadcn/ui patterns + custom Paperclip design system
- Testing: Vitest + React Testing Library + Storybook
- Key directories: `frontend/src/components/ui/`, `frontend/src/components/work/`, `frontend/src/components/shell/`, `frontend/src/components/chat/`

**Entry Point:** `frontend/src/main.tsx`

**How to Run:**
```bash
cd frontend && npm run dev          # Dev server
cd frontend && npm run storybook    # Storybook at port 6006
```

**Port:** 5173 (Vite dev), 6006 (Storybook)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `frontend/src/components/ui/Tooltip.tsx` | frontend | **CREATE** — New Tooltip component with portal rendering, delay, placement, aria-label derivation |
| `frontend/src/components/ui/Tooltip.test.tsx` | frontend | **CREATE** — 8 unit tests: render, aria-label derivation, explicit label, delay, hide, cancel, focus/blur, custom delay |
| `frontend/src/components/ui/Tooltip.stories.tsx` | frontend | **CREATE** — 4 stories: Default, DerivedFromAriaLabel, BottomPlacement, IconButtonRow |
| `frontend/src/components/work/ActionRow.tsx` | frontend | Wrap 5 icon buttons with `<Tooltip>`: complete, focus, notes, edit/collapse, move menu |
| `frontend/src/components/work/ActionRow.test.tsx` | frontend | Add `ActionRow tooltip integration` describe block with 5 tests |
| `frontend/src/components/work/ProjectTree.tsx` | frontend | Wrap 6 elements with `<Tooltip>`: show all, create project, stalled indicator (with explicit label), archive, rename, star |
| `frontend/src/components/work/ProjectTree.test.tsx` | frontend | Add `ProjectTree tooltip integration` describe block with 3 tests |
| `frontend/src/components/work/ReferenceRow.tsx` | frontend | Wrap 7 elements with `<Tooltip>`: notes, external link, view file, download, actions menu, view markdown, edit markdown |
| `frontend/src/components/shell/AppHeader.tsx` | frontend | Wrap chat toggle button with `<Tooltip>` |
| `frontend/src/components/shell/AppHeader.test.tsx` | frontend | Add `AppHeader chat toggle` describe block with 4 tests (render, click, minimize label, tooltip hover) |
| `frontend/src/components/chat/ChatInput.tsx` | frontend | Wrap send button with `<Tooltip>` |
| `frontend/src/docs/product/EpicEmailPreviewEnhancements.mdx` | frontend | **CREATE** — New MDX product spec for Email Preview Enhancements epic |
| `.gitignore` | root | Remove auto-claude-related entries (11 lines removed) |
| `.claude/settings.json` | root | Add `Bash(git pull:*)` permission |
| `frontend/coverage/*` | frontend | Remove old HTML coverage artifacts (62 files deleted), update `coverage-final.json` |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `frontend/src/components/ui/Icon.tsx` | Component structure: props interface with JSDoc, functional component, `cn()` utility for className merging |
| `frontend/src/components/ui/Icon.test.tsx` | Test structure: `describe/it` blocks, `@testing-library/react` assertions |
| `frontend/src/components/ui/Icon.stories.tsx` | Story structure: `Meta`/`StoryObj` types, `satisfies Meta<>`, args pattern |
| `frontend/src/components/work/ActionRow.tsx` | Integration pattern: how icon buttons are structured with `aria-label`, `cn()`, `Icon` |
| `frontend/src/components/work/ActionRow.test.tsx` | Test pattern: `renderRow` helper, `vi.fn()` callbacks, `screen.getByLabelText()` |

## Patterns to Follow

### UI Component Pattern (from Icon.tsx)

```typescript
import { cn } from "@/lib/utils";

export interface TooltipProps {
  /** JSDoc description */
  label?: string;
  placement?: "top" | "bottom";
  delay?: number;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, placement = "top", ... }: TooltipProps) {
  // Component implementation
}
```

**Key Points:**
- Export both the Props interface and the component
- Use JSDoc comments on props
- Use `cn()` from `@/lib/utils` for className composition
- Use design token CSS variables: `--radius-sm`, `--shadow-card`, etc.
- Use semantic color classes: `bg-text`, `text-surface`, `text-text-muted`, etc.

### Tooltip Integration Pattern

```tsx
// BEFORE: bare icon button
<button aria-label="Archive" className="...">
  <Icon name="archive" size={14} />
</button>

// AFTER: wrapped with Tooltip (derives label from aria-label)
<Tooltip>
  <button aria-label="Archive" className="...">
    <Icon name="archive" size={14} />
  </button>
</Tooltip>
```

**Key Points:**
- Tooltip wraps the entire button/link element
- No explicit `label` prop needed when the child has `aria-label` — Tooltip derives it automatically
- Use explicit `label` prop only when the tooltip text should differ from aria-label (e.g., stalled indicator: `<Tooltip label="Needs next action">`)
- The wrapping `<span className="inline-flex">` is part of the Tooltip's render output

### Test Pattern for Tooltip Integration

```typescript
describe("ComponentName tooltip integration", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows tooltip on button hover", async () => {
    renderComponent({ /* props */ });
    const wrapper = screen.getByLabelText("Label text").closest("span")!;
    await userEvent.hover(wrapper);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Label text");
  });
});
```

**Key Points:**
- Use `vi.useFakeTimers({ shouldAdvanceTime: true })` to control tooltip delay
- Hover on the wrapping `<span>` (`.closest("span")!`), not the button itself
- Advance timers by 400ms (default delay)
- Assert via `screen.getByRole("tooltip")`

## Requirements

### Functional Requirements

1. **Tooltip Component**
   - Description: A reusable tooltip primitive that renders via `createPortal` to `document.body`, positioned relative to the trigger element
   - Props: `label?` (string), `placement?` ("top" | "bottom", default "top"), `delay?` (number, default 400ms), `children` (ReactNode), `className?` (string)
   - Positioning: centered horizontally below/above trigger, clamped to viewport edges (4px margin), auto-flips from top to bottom if insufficient space
   - Acceptance: Tooltip appears on hover/focus after delay, disappears on leave/blur, uses `role="tooltip"`, renders via portal

2. **Aria-label Derivation**
   - Description: When no explicit `label` prop is provided, the Tooltip searches its children for the nearest element with an `aria-label` attribute and uses that text
   - Acceptance: Wrapping `<Tooltip><button aria-label="X">...</button></Tooltip>` shows tooltip with text "X" without needing `label="X"`

3. **Delay & Cancellation**
   - Description: Tooltip shows after a configurable delay (default 400ms). If the user moves away before the delay fires, the tooltip never appears
   - Acceptance: Hovering for less than 400ms then leaving produces no tooltip

4. **Broad UI Integration**
   - Description: All icon-only buttons across the main UI surfaces gain tooltip hints
   - Components: ActionRow (5 buttons), ProjectTree (6 elements), ReferenceRow (7 elements), AppHeader (1 button), ChatInput (1 button)
   - Acceptance: Every icon button wrapped shows its aria-label as tooltip on hover

5. **Storybook Documentation**
   - Description: Tooltip has 4 interactive stories demonstrating key variants
   - Acceptance: Stories render in Storybook with correct visual behavior

### Edge Cases

1. **No label and no aria-label** — Tooltip renders children normally; no tooltip popup appears (graceful degradation)
2. **Viewport clamping** — Tooltip positioned near screen edge is shifted to stay within 4px of viewport bounds
3. **Auto-flip** — When `placement="top"` but trigger is near top of viewport (< 4px space), tooltip flips to bottom
4. **Rapid hover/unhover** — Timeout is cleared on mouse leave; no stale tooltip appears
5. **Unmount during delay** — Timeout is cleaned up in useEffect cleanup; no setState on unmounted component
6. **Portal rendering** — Tooltip content renders in `document.body` via `createPortal`, avoiding overflow/clipping from parent containers

## Implementation Notes

### DO
- Follow the component pattern from `Icon.tsx` for file structure and export conventions
- Use `createPortal(...)` to render the tooltip in `document.body` — avoids z-index and overflow issues
- Use `useId()` for generating unique tooltip element IDs
- Use design token CSS variables (`--radius-sm`, `--shadow-card`) for styling consistency
- Use `cn()` utility for className composition
- Derive aria-label from DOM at interaction time (in the `show` callback), not during render
- Wrap every icon-only `<button>` and `<a>` with `<Tooltip>` in integration components
- Use `vi.useFakeTimers({ shouldAdvanceTime: true })` in all tooltip-related tests

### DON'T
- Don't use a third-party tooltip library — this is a custom Paperclip design system component
- Don't add `aria-describedby` on triggers (the PR doesn't implement this; tooltip serves as visual hint)
- Don't use `autoFocus` with eslint-disable — use proper focus management
- Don't modify the Tooltip's wrapping `<span className="inline-flex">` — it's intentional for layout
- Don't forget to clean up timeouts on unmount (`useEffect` cleanup)

## Development Environment

### Start Services

```bash
cd frontend && npm run dev          # Vite dev server
cd frontend && npm run storybook    # Storybook
```

### Service URLs
- Frontend Dev: http://copilot.localhost:5173
- Storybook: http://copilot.localhost:6006

### Required Environment Variables
- `VITE_API_BASE_URL`: Backend API URL (default from `.env`)
- `PROJECT_PREFIX`: Hostname prefix (default: `copilot`)

## Success Criteria

The task is complete when:

1. [ ] `Tooltip.tsx` component is created with portal-based rendering, delay, placement, and aria-label derivation
2. [ ] `Tooltip.test.tsx` has 8 passing unit tests covering all component behaviors
3. [ ] `Tooltip.stories.tsx` has 4 stories rendering correctly in Storybook
4. [ ] `ActionRow.tsx` has 5 icon buttons wrapped with Tooltip
5. [ ] `ProjectTree.tsx` has 6 elements wrapped with Tooltip
6. [ ] `ReferenceRow.tsx` has 7 elements wrapped with Tooltip
7. [ ] `AppHeader.tsx` has chat toggle wrapped with Tooltip
8. [ ] `ChatInput.tsx` has send button wrapped with Tooltip
9. [ ] All tooltip integration tests pass in `ActionRow.test.tsx`, `ProjectTree.test.tsx`, `AppHeader.test.tsx`
10. [ ] `EpicEmailPreviewEnhancements.mdx` product doc is created
11. [ ] No TypeScript errors (`npx tsc -b --noEmit`)
12. [ ] No ESLint errors (`npx eslint src/`)
13. [ ] No Prettier formatting issues (`npx prettier --check src/`)
14. [ ] All existing tests still pass (`CI=1 npx vitest run --project=unit`)
15. [ ] Storybook builds without errors (`npm run build-storybook`)

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Renders children without tooltip | `frontend/src/components/ui/Tooltip.test.tsx` | Children render, no tooltip role element present when no label |
| Derives label from aria-label | `frontend/src/components/ui/Tooltip.test.tsx` | Tooltip text matches child's aria-label attribute |
| Explicit label overrides aria-label | `frontend/src/components/ui/Tooltip.test.tsx` | `label` prop takes precedence over derived aria-label |
| Shows after hover delay | `frontend/src/components/ui/Tooltip.test.tsx` | Tooltip not visible immediately, visible after 400ms |
| Hides on mouse leave | `frontend/src/components/ui/Tooltip.test.tsx` | Tooltip disappears when cursor leaves trigger |
| Cancels if leave before delay | `frontend/src/components/ui/Tooltip.test.tsx` | No tooltip appears if unhover happens before delay |
| Shows on focus, hides on blur | `frontend/src/components/ui/Tooltip.test.tsx` | Keyboard focus triggers tooltip, blur dismisses |
| Respects custom delay | `frontend/src/components/ui/Tooltip.test.tsx` | `delay={100}` shows tooltip after 100ms, not before |
| ActionRow complete button tooltip | `frontend/src/components/work/ActionRow.test.tsx` | Hovering complete button shows tooltip with action label |
| ActionRow focus star tooltip | `frontend/src/components/work/ActionRow.test.tsx` | Hovering star shows tooltip with focus label |
| ActionRow edit button tooltip | `frontend/src/components/work/ActionRow.test.tsx` | Hovering edit shows tooltip with edit label |
| ActionRow move menu tooltip | `frontend/src/components/work/ActionRow.test.tsx` | Hovering more_vert shows tooltip with move label |
| ActionRow tooltip hides on leave | `frontend/src/components/work/ActionRow.test.tsx` | Tooltip disappears after unhover |
| ProjectTree star button tooltip | `frontend/src/components/work/ProjectTree.test.tsx` | Hovering star shows tooltip text |
| ProjectTree archive button tooltip | `frontend/src/components/work/ProjectTree.test.tsx` | Hovering archive shows tooltip text |
| ProjectTree create button tooltip | `frontend/src/components/work/ProjectTree.test.tsx` | Hovering create shows tooltip text |
| AppHeader chat toggle tooltip | `frontend/src/components/shell/AppHeader.test.tsx` | Hovering chat toggle shows tooltip text |
| AppHeader chat toggle renders | `frontend/src/components/shell/AppHeader.test.tsx` | Chat toggle button present when prop provided |
| AppHeader chat toggle fires callback | `frontend/src/components/shell/AppHeader.test.tsx` | Click calls onToggleChat |
| AppHeader minimize label | `frontend/src/components/shell/AppHeader.test.tsx` | Shows "Chat minimieren" when chat is open |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Tooltip portal rendering | frontend (DOM) | Tooltip `<div>` renders in `document.body`, not inside the trigger's parent container |
| Tooltip with dynamic aria-labels | frontend (ActionRow) | Tooltip derives correct text when aria-label changes based on state (e.g., "Complete" vs "Completed") |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Icon button tooltip | 1. Navigate to work view 2. Hover an icon button 3. Wait 400ms | Tooltip appears with descriptive text matching the button's purpose |
| Tooltip dismissal | 1. Hover an icon button 2. Wait for tooltip 3. Move mouse away | Tooltip disappears immediately |
| Keyboard tooltip | 1. Tab to focus an icon button 2. Wait 400ms | Tooltip appears via focus event |

### Storybook Verification
| Story | URL | Checks |
|-------|-----|--------|
| Primitives/Tooltip/Default | `http://copilot.localhost:6006/?path=/story/primitives-tooltip--default` | Hover shows "Archive" tooltip above the archive icon |
| Primitives/Tooltip/DerivedFromAriaLabel | `http://copilot.localhost:6006/?path=/story/primitives-tooltip--derived-from-aria-label` | Tooltip text derived from `aria-label="Star project"` |
| Primitives/Tooltip/BottomPlacement | `http://copilot.localhost:6006/?path=/story/primitives-tooltip--bottom-placement` | Tooltip renders below the trigger |
| Primitives/Tooltip/IconButtonRow | `http://copilot.localhost:6006/?path=/story/primitives-tooltip--icon-button-row` | Row of 4 icon buttons each shows its own tooltip |

### QA Sign-off Requirements
- [ ] All unit tests pass (`CI=1 npx vitest run --project=unit`)
- [ ] All Storybook tests pass (`STORYBOOK_TESTS=1 CI=1 npx vitest run --project=storybook`)
- [ ] Storybook builds successfully (`npm run build-storybook`)
- [ ] TypeScript compiles without errors (`npx tsc -b --noEmit`)
- [ ] ESLint passes (`npx eslint src/`)
- [ ] Prettier passes (`npx prettier --check src/`)
- [ ] Storybook verification complete — all 4 Tooltip stories render correctly
- [ ] No regressions in existing ActionRow, ProjectTree, ReferenceRow, AppHeader, ChatInput functionality
- [ ] Tooltip has correct `role="tooltip"` for accessibility
- [ ] Tooltip portal renders in `document.body` (no z-index/overflow issues)
- [ ] No security vulnerabilities introduced
- [ ] Code follows established Paperclip design system patterns
