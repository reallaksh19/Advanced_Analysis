# Analysis Workspace Phase 1 Architecture

## Status

Phase 1 establishes the application shell and cross-panel communication contract. It does not implement a WebGL renderer, engineering solver execution, or real dataset adaptation.

## Runtime boundary

The application entry mounts one `Analysis Workspace` rather than routing among the former top-level feature tabs.

```text
Application root
  -> Workspace layout
      -> Tree panel
      -> Viewport panel
      -> Properties panel
```

The three panels are independently constructed and destroyed. A panel controller may query only within its injected root element.

## Event contract

`EventBus` is a synchronous singleton backed by `Map<string, Set<Function>>`.

Canonical topics:

- `dataset:loaded`
- `viewport:entitySelected`
- `analysis:requested`

Subscriptions return idempotent unsubscribe closures. Publishing takes a listener snapshot, invokes every listener synchronously, and reports listener failures only after complete delivery.

Canonical payloads are validated at runtime. The selection event permits omitted optional fields so the required DevTools verification call remains supported.

## Panel responsibilities

### Tree panel

- Owns only tree-root DOM.
- Uses delegated click handling.
- Publishes selection events.
- Does not access Viewport or Properties DOM.

### Viewport panel

- Owns the viewport-root status and placeholder DOM.
- Subscribes to dataset, selection, and analysis-request events.
- Contains a WebGL mount point but no rendering engine.

### Properties panel

- Owns only properties-root DOM.
- Subscribes to selection events.
- Publishes contextual analysis requests.
- Does not execute calculations directly.

## Layout contract

Desktop layout:

```css
.workspace-shell {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 350px;
  height: 100vh;
  overflow: hidden;
}
```

Responsive rules collapse the fixed side-panel widths without introducing a second navigation model.

## Verification

Automated checks enforce:

- exact event names and payload validation;
- synchronous complete-listener delivery;
- unsubscribe cleanup;
- module size at or below 300 lines;
- no cross-panel `document.querySelector()` use;
- exact three-column grid contract;
- direct DevTools publication rendering in Properties;
- contextual analysis publication;
- complete controller teardown;
- production build and browser smoke behavior.

CI commands:

```bash
npm run check:phase1-workspace:static
npm run check:workspace-browser
```

## Phase 2 dependency

Phase 2 is tracked by Issue #91. It must introduce a framework-neutral dataset/state adapter and real JSON import without importing the legacy Zustand workspace store into the new panel runtime.
