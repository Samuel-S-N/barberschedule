# Recurrence materialization

Recurring series keep a shop-local anchor date/time and interval in weeks. `ensure_recurrence_window` materializes at most 90 local days ahead under one shop advisory lock. Each series/date identity is unique, so repeated jobs are safe.

Unavailable occurrences become explicit conflict rows; the system never silently moves them. Cancellation exceptions and materialized appointment history remain durable. The hourly job is optional at migration time and must be supplied by the deployment scheduler when `pg_cron` is unavailable.
