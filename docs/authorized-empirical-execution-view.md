# Authorized empirical execution view

The Load Calc header now labels the active calculation authority as `AUTHORIZED_HANDOFF`, `LEGACY_PROJECT_DATA`, or `NOT_CALCULATED`.

When an authorized execution receipt is active, the Load Evaluation pane shows its execution identity, timestamp, project, status, baseline hash, handoff hash, projection-payload hash, authorized-input hash, distribution hash, and receipt hash. The panel is read-only.

The engineering support-load store clears the authorized receipt whenever the dataset, Project Data, or master data makes the distribution stale. The view therefore cannot display stale authorized authority after the store has invalidated it.
