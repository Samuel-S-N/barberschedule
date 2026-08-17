# Decision 004: Catalog and customer model

Date: 2026-08-13
Status: accepted

## Context

Task 3 adds the first shop catalog and customer records needed before schedule, availability, or appointments exist. The model has to keep public catalog reads narrow, owner writes strict, and future appointment history stable even after catalog items are archived.

## Decision

- `customers.user_id` is nullable.
- Customer records are never auto-linked from matching email or phone values.
- Catalog money is stored as integer cents (`price_cents`, `price_override_cents`).
- Service duration is required at the service level and stored as positive integer minutes.
- Barber-specific duration and price changes are explicit nullable overrides on `barber_services`.
- Barbers, services, customers, and barber-services use soft deactivation with `active` plus `archived_at`; references to those rows can stay valid after deactivation.
- `resolve_effective_service(target_barber_service_id)` resolves the current effective duration and price by applying barber overrides over the current service defaults.
- Public catalog reads stay limited to active rows. Owners can still read archived rows for history.

## Why

- Nullable `customers.user_id` supports owner-created walk-in customers before an authenticated account exists.
- Avoiding email/phone auto-linking prevents accidental account attachment and keeps ownership decisions explicit.
- Integer cents avoid floating-point money bugs.
- Required base service duration/price keep the catalog complete even when no barber override exists.
- Soft deactivation preserves row references without hard deletes while later tasks add immutable appointment snapshots where history must not change.
- The effective-service function gives later booking work one stable place to resolve the current catalog values at booking time.

## Consequences

- Owners must explicitly attach a customer account later if that workflow is added.
- Public clients can safely read catalog tables directly through RLS without seeing archived data.
- Current catalog rows remain mutable; this task does not create historical price or duration snapshots.
- Appointment work is expected to add immutable snapshots so later catalog edits do not rewrite booked history.
