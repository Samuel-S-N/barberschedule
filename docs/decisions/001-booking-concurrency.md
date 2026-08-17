# Booking concurrency

PostgreSQL owns the final race guard. A GiST exclusion constraint rejects overlapping active barber occupancy, while the booking RPC takes a shop/customer/local-day advisory lock before enforcing the one-customer-per-day rule. A failed reschedule updates no durable appointment state because the transaction rolls back.

Client concurrency tests prove the loser maps to `SLOT_UNAVAILABLE`; pgTAP proves the database constraint and rollback. A two-session network fixture remains deployment-hardening work.
