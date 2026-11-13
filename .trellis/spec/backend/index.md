# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | To fill |
| [Database Guidelines](./database-guidelines.md) | PostgreSQL-first migration/DDL verification; other conventions pending | Partial |
| [Error Handling](./error-handling.md) | Error types, handling strategies | To fill |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | To fill |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | To fill |
| [Partner Authorization Audit](./partner-authorization-audit.md) | Safe tenant credential receipts, LOG_DB migration, decimal admin metadata/filter and best-effort guarantees | Source/frontend checked; Go/pq runtime blocked |
| [Partner Integration Modes](./partner-integration-mode.md) | Immutable creation policy, selected entry admission, additive mode migration and audit handoff | Implemented; Docker/pq runtime blocked |
| [Partner Tenant Paid Checkout](./partner-tenant-checkout.md) | Paid-only Tenant order/cashier/fulfillment, identity isolation and subscription-only funding | Implemented; DB runtime gate pending |
| [Subscription Access Keys](./partner-subscription-key.md) | User-ID-free orders, paid-only internal users, independent single-subscription keys and same-row renewal | Implemented; targeted isolated pq passed, deployment unverified |
| [Optional Hosted H5](./partner-hosted-h5.md) | Limited purchase sessions, transactional authority, exact quota DTO and standalone selector/cashier recovery | Implemented; DB runtime gate pending |
| [Group IQ Tests](./group-iq-tests.md) | Single-attempt routing, calendar/lease persistence, private latest artwork and API permissions | Implemented |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
