-- The barber reports screen uses get_my_barber_report; the old per-service earnings RPC has no client left.
drop function public.get_my_barber_earnings(date, date);
