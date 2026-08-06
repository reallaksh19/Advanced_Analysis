# NC-08R Real-Module Evidence Input Template

This template identifies the real records required before an authoritative NC-08R qualification run can be assembled. Do not populate it with simulated identities or synthetic approvals.

## Production-intended module

```text
module ID:
module version:
exact source head SHA:
source tree SHA:
build artifact SHA-256:
artifact signature SHA-256:
build provenance SHA-256:
source manifest SHA-256:
dependency lock SHA-256:
SBOM SHA-256:
API schema SHA-256:
migration manifest SHA-256:
runtime profile SHA-256:
test manifest SHA-256:
rollback package SHA-256:
runbook SHA-256:
```

## Verification records

```text
artifact signature verified by:
provenance verified by:
source manifest verified by:
dependency lock verified by:
SBOM verified by:
independent build 1 record:
independent build 2 record:
reference regression record:
security and hostile-input report:
resource-bound report:
installation verification:
rollback/recovery exercise:
```

## Real approvals

```text
technical reviewer identity and approval record:
security reviewer identity and approval record:
release owner identity and approval record:
approval effective date:
approval expiry date:
revocation status:
```

## Authority boundary

Even a complete NC-08R package may grant only:

```text
moduleQualified = true
nc09ProductionAuthorizationAuthorized = true
```

It must not grant:

```text
productionExecutionAuthorized = true
nc10Authorized = true
```
