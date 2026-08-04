# Empirical mechanical extension seams

**EMP-01 scope:** authorized production cutover and freshness evidence only.

EMP-01 does not change `CHAINAGE_TRIBUTARY_SPAN_V2` and does not implement CoG-based reaction allocation, displacement-induced force, friction-force solution, liftoff redistribution, support-group structural analysis, beam analysis, piping flexibility, or FEA.

## Shared evidence envelope

Every later empirical result shall bind the project, source dataset identity/version/hash, shared-model hash, support-site hash, route-partition hash, Project Data policy hash, master-source hashes, published baseline identity/revision/hash, readiness and projection hashes, authorized-handoff hash, authorized-input/overlay hashes, calculation method/version, load case, explicit assumptions, caller-supplied execution identity/timestamp, ledgers, equilibrium evidence, and input/output/receipt hashes.

Missing or mismatched evidence fails closed. Stale historical evidence may remain visible but is not calculation eligible.

## Gravity and CoG audit

Each contribution retains source entity, route, load case, mass decomposition, force, chainage/global position, evidence, transfer rule, and support allocations. Future audit outputs may include total weight, mass decomposition, route/global CoG, force and moment summaries, allocation ledgers, and residuals:

```text
W_total = sum(W_i)
x_CG = sum(W_i x_i) / sum(W_i)
sum(R_i) - sum(W_i) = 0
sum(R_i x_i) - sum(W_j x_j) = 0
```

Global CoG is audit evidence. It does not uniquely determine reactions at three or more supports and shall not replace the current local bracketing rule.

## Free displacement and directional gaps

A future movement screen may use qualified temperature, expansion coefficient, length/path, axes, and imposed movements:

```text
Delta L = alpha L Delta T
```

This is unconstrained displacement demand, not anchor, guide, stop, nozzle, or support force. A force requires a governed stiffness relationship or structural model.

Directional gap evaluation transforms relative displacement into the restraint local axis and may report:

```text
GAP_OPEN
GAP_AT_CONTACT
GAP_ENGAGEMENT_PREDICTED
WRONG_DIRECTION_NO_ENGAGEMENT
DISPLACEMENT_NOT_EVALUATED
```

Gap closure predicts contact only. Guide clearance is not an axial stop gap, and no reaction exists before contact.

## Friction capacity

For active normal contact only:

```text
|F_t| <= mu N
```

The contract separates normal reaction, coefficient, friction capacity, movement direction, developed tangential force, and stick/slip state. `mu N` is a capacity, not automatically the developed force. Open or lifted contact cannot develop Coulomb friction.

## One-way support and liftoff

Compression-only contact requires:

```text
R_n >= 0
g >= 0
R_n g = 0
```

A negative preliminary reaction is a liftoff/contact-set inconsistency, not compression and not an inferred hold-down load. Without sufficient stiffness and compatibility for a governed active-set solution, report:

```text
SCREENED
LIFTOFF_PREDICTED
REDISTRIBUTION_NOT_EVALUATED
FEA_REQUIRED
```

Do not clip negative reactions, retain unchanged companion reactions, or proportionally renormalize. EMPTY, OPE, and HYD may have different active contact sets.

## Eccentric support groups

A multi-pad, shoe, clamp, or hold-down site may require site resultant force/moment, local reactions, centre of pressure, contact state, hold-down demand/capacity, compression utilization, and residual overturning moment. Rigid-body statics is empirical only when coordinates, rigidity, capability, and contact footprint are qualified and flexibility is negligible. Flexible or indeterminate frames, partial bearing/contact pressure, local stress, bolt/weld demand, and nonlinear uplift require a governed structural analysis.

## Result and escalation boundary

Primary disposition, findings, and next action remain separate:

```text
CALCULATED
SCREENED
BLOCKED_MISSING_INPUT
BLOCKED_STALE_INPUT
BLOCKED_UNAUTHORIZED
BLOCKED_UNSUPPORTED_METHOD
STALE
GAP_ENGAGEMENT_PREDICTED
LIFTOFF_PREDICTED
REDISTRIBUTION_NOT_EVALUATED
FEA_REQUIRED
```

A current support reaction is publishable only when the case is `CALCULATED`, authorization and receipt are current, the value is finite, and equilibrium passed. Escalate when the decision requires displacement-induced restraint force, post-contact force/displacement, friction distribution, post-liftoff redistribution, flexible support-group loads, local stress, nonlinear contact, or piping-code flexibility/stress compliance.
