-- The professional reports screen uses get_my_professional_report; the old per-service earnings RPC has no client left.
drop function public.get_my_professional_earnings(date, date);
