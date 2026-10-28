-- Security audit 2026-10-27. Limits mirror the app's Zod schemas, so the app normally refuses first; these
-- constraints hold for callers that skip the app and talk to the API directly.
alter table public.appointments add constraint appointments_notes_length check (notes is null or char_length(notes) <= 500);
alter table public.customers
  add constraint customers_full_name_length check (char_length(full_name) <= 100),
  add constraint customers_email_length check (email is null or char_length(email) <= 254),
  add constraint customers_phone_length check (phone is null or char_length(phone) <= 30);
alter table public.profiles add constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 100);
alter table public.barbers
  add constraint barbers_name_length check (char_length(name) <= 80),
  add constraint barbers_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 500);
alter table public.services
  add constraint services_name_length check (char_length(name) <= 80),
  add constraint services_description_length check (description is null or char_length(description) <= 500);
