# ADR 0001: MVP Stack Selection

- Date: 2026-02-20
- Status: Accepted

## Context
WiFinder currently has product specs and implementation planning but no application code. The MVP needs a delivery path that enables rapid backend iteration and deterministic local testing without infrastructure dependencies.

## Decision
Use a Node.js-first stack for the first increment:
- Runtime: Node.js 20+ (ES modules)
- API layer: built-in `http` module (no framework dependency for initial slice)
- Data layer: in-memory store for local/dev tests
- Tests: Node built-in test runner (`node --test`)

## Consequences
- Pros:
  - Zero dependency bootstrapping and predictable local execution.
  - Fast path to implement and validate API contract behavior from spec.
  - Easy future replacement of in-memory store with a persistent DB while preserving handler contracts.
- Cons:
  - In-memory store is non-persistent and not production-ready.
  - Additional migration work will be required for durable storage and deployment environments.
