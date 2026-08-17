# Timezone model

Shops store an IANA timezone, initially `America/Sao_Paulo`. Weekly periods, overrides, recurrence occurrence dates, and customer daily limits use shop-local `date`/`time` values. Appointments remain `timestamptz`; conversion happens at the RPC boundary.

Availability returns both local display values and UTC instants. The database, not the device timezone, decides whether a date is open or whether a customer already booked that local day.
