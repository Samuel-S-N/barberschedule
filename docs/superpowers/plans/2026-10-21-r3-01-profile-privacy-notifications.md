# Profile, Privacy and Notification Clearing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Settings and one Privacy-and-data screen for client, barber and owner; honest toast after booking; notifications can be cleared (X = all, long-press = one).

**Architecture:** Two shared screens in `src/features/account/` replace the six near-identical route files. One migration extends account deletion to barbers, the data export to barbers, and adds `delete_notifications`. Two small modals (`ConfirmDialog`, `NotificationActionSheet`) built on RN `Modal`.

**Tech Stack:** Postgres/pgTAP, Expo Router, React Query, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round3-design.md`

## Global Constraints
- Branch `feat-profile-notifications` from `docs-ux-round3`. Migration `0054`, pgTAP `035_account_and_notifications.sql`.
- Settings = Language only. Privacy and data = Terms, Download my data, Delete account (client + barber); owner sees `owner.profile.privacyNote` instead of Delete.
- Menu order on every role: Account, Security, role block, Settings, Privacy and data, About.
- Notification X is at the **top-right** of the header; long-press opens a pop-up with **Delete**; both delete permanently, own rows only.
- Toast after booking: pt "Agendado! Aguardando confirmação do barbeiro.", en "Booked! Waiting for the barber to confirm.", es "¡Agendado! Esperando la confirmación del barbero."
- Test ids: `profile-export`, `profile-delete`, `profile-delete-confirm`, `privacy-terms`, `owner-privacy-note`, `notifications-clear`, `notifications-clear-confirm`, `notification-delete-<id>`, `confirm-dialog`.
- Use `rtk` for noisy commands; verify UI at 375px in a browser; e2e needs `.env.local` moved aside (`/tmp/claude-1000/restart.sh` does it) and an Expo restart after each source change; apply migrations locally with `docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < file.sql` plus a `schema_migrations` row.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Database (pgTAP first)

**Files:** Create `supabase/migrations/0054_account_and_notifications.sql`, `supabase/tests/035_account_and_notifications.sql`.

**Produces (DB):** `prepare_account_deletion()` for `customer` and `barber`; `export_my_data()` with a `barbers` array; `delete_notifications(target_ids uuid[] default null) → integer`.

- [ ] **Step 1: Failing pgTAP** `035_account_and_notifications.sql` (plan(8)): seed an owner `fd…01`, a barber user `fd…02` with a barber row, a customer user `fd…03`, a shop, a service, a barber_service and a working period. Assertions: (1) the barber's `prepare_account_deletion()` with a future `scheduled` appointment throws `P0018`; (2) after cancelling it, it lives; (3) the barber row afterwards has `active = false`, `user_id is null`, `archived_at is not null`; (4) the owner's `prepare_account_deletion()` throws `42501`; (5) `export_my_data()` for a barber has `jsonb_array_length(data->'barbers') = 1`; (6) a user with 3 notifications deleting 1 id gets 1 back; (7) `delete_notifications(null)` deletes the rest (returns 2); (8) it never touches another user's rows (the other user's count is unchanged).
  Seed rows with plain `insert` as in `034_recurrence_plans.sql` (same style: `auth.users` rows, profile role updates, `set local role authenticated`, `request.jwt.claim.sub`). Notifications are inserted as the table owner before `set local role` using `kind = 'appointment_booked'` and unique `event_key`s.
  Run `npm run test:db` → new file FAILS.

- [ ] **Step 2: Migration** `0054_account_and_notifications.sql`:

```sql
create or replace function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  my_barber uuid;
begin
  select role::text into actor_role from public.profiles where user_id = actor;
  if actor is null or coalesce(actor_role, '') not in ('customer', 'barber') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if actor_role = 'customer' then
    if exists (
      select 1 from public.appointments a
      join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
      where c.user_id = actor and a.status in ('scheduled', 'confirmed') and a.starts_at > clock_timestamp()
    ) or exists (
      select 1 from public.recurrence_series s
      join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
      where c.user_id = actor and s.active
    ) then
      raise exception using errcode = 'P0018', message = 'ACCOUNT_DELETION_BLOCKED';
    end if;

    update public.customers
    set full_name = 'Cliente removido', email = null, phone = null, user_id = null,
        anonymized_at = clock_timestamp(), active = false,
        archived_at = coalesce(archived_at, clock_timestamp()), updated_at = clock_timestamp()
    where user_id = actor;
    return;
  end if;

  select id into my_barber from public.barbers where user_id = actor;
  if my_barber is not null and (
    exists (
      select 1 from public.appointments a
      where a.barber_id = my_barber and a.status in ('scheduled', 'confirmed') and a.starts_at > clock_timestamp()
    ) or exists (
      select 1 from public.recurrence_series s
      join public.barber_services bs on bs.id = s.barber_service_id
      where bs.barber_id = my_barber and s.active
    )
  ) then
    raise exception using errcode = 'P0018', message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  update public.barbers
  set name = 'Barbeiro removido', user_id = null, active = false, bio = null, avatar_url = null,
      archived_at = coalesce(archived_at, clock_timestamp()), updated_at = clock_timestamp()
  where id = my_barber;
end;
$$;
```
Then re-create `export_my_data()` copying the body from `0023_customer_self_service.sql` (lines 117–163) with `create or replace` and one more key after `'customers'`:

```sql
    'barbers', coalesce((select jsonb_agg(to_jsonb(b)) from public.barbers b where b.user_id = actor), '[]'::jsonb),
```
and finally:

```sql
create function public.delete_notifications(target_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_FORBIDDEN';
  end if;

  delete from public.notifications where user_id = auth.uid() and (target_ids is null or id = any (target_ids));
  get diagnostics removed = row_count;

  return removed;
end;
$$;

revoke all on function public.delete_notifications(uuid[]) from public, anon;
grant execute on function public.delete_notifications(uuid[]) to authenticated;
```
Generate `export_my_data` with a short Python script that slices `0023` (find `create or replace function public.export_my_data()` to the next `\n$$;`) and inserts the `barbers` line, as done for `0053`.

- [ ] **Step 3: Apply and run**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -q < supabase/migrations/0054_account_and_notifications.sql 2>&1 | grep -i error
docker exec supabase_db_barberschedule psql -U postgres -d postgres -qc "insert into supabase_migrations.schema_migrations (version,name) values ('0054','account_and_notifications') on conflict do nothing"
npm run test:db 2>&1 | grep -v NOTICE | grep -A6 "035_account"
```
Expected `035 … ok`; other failures are the known dev-data ones.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(db): barber account deletion/export and delete_notifications"`

---

### Task 2: Client API and copy

**Files:** Modify `src/features/notifications/inbox-api.ts`, `src/i18n/locales/{en,pt,es}.ts`, `tests/unit/` (new `notifications-delete.test.ts`), `tests/e2e/booking.web.spec.ts`, `tests/unit/toast.test.ts` untouched (it uses its own text).

**Produces:** `deleteNotifications(supabase, ids?: string[]): Promise<number>` calling `delete_notifications` with `{ target_ids: ids ?? null }`.

- [ ] **Step 1: Failing unit test** `tests/unit/notifications-delete.test.ts`:

```ts
import { deleteNotifications } from "../../src/features/notifications/inbox-api";

it("deletes the given notifications", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: 2, error: null });

  expect(await deleteNotifications({ rpc } as never, ["a", "b"])).toBe(2);
  expect(rpc).toHaveBeenCalledWith("delete_notifications", { target_ids: ["a", "b"] });
});

it("deletes everything when no ids are given", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: 5, error: null });

  expect(await deleteNotifications({ rpc } as never)).toBe(5);
  expect(rpc).toHaveBeenCalledWith("delete_notifications", { target_ids: null });
});
```
Run → FAIL.
- [ ] **Step 2: Implement** — append to `inbox-api.ts`:

```ts
export async function deleteNotifications(supabase: Pick<SupabaseClient, "rpc">, ids?: string[]) {
  const { data, error } = await supabase.rpc("delete_notifications", { target_ids: ids ?? null });
  if (error) throw error;

  return Number(data ?? 0);
}
```
- [ ] **Step 3: Strings** (en first; `pt`/`es` below). Rename `home.bookingConfirmed` to `home.bookingScheduled` everywhere it is used (`app/(customer)/(tabs)/home.tsx`). Change `profile.menu.privacy` and `profile.privacy.title` to "Privacy and data" and add the new keys:

```ts
// home
    bookingScheduled: "Booked! Waiting for the barber to confirm.",
// profile.menu / profile.privacy
    privacy: "Privacy and data",
// notifications block (next to markAllRead)
    clearAll: "Clear all notifications",
    clearAllBody: "Delete every notification? This cannot be undone.",
    clearAllConfirm: "Delete all",
    delete: "Delete",
    deleteError: "Unable to delete.",
    deleteOne: "Delete this notification",
// common
    cancel: "Cancel"   // only if it does not exist yet
```
pt: `bookingScheduled: "Agendado! Aguardando confirmação do barbeiro."`, `privacy: "Privacidade e dados"`, `clearAll: "Limpar notificações"`, `clearAllBody: "Apagar todas as notificações? Não dá para desfazer."`, `clearAllConfirm: "Apagar tudo"`, `delete: "Apagar"`, `deleteError: "Não foi possível apagar."`, `deleteOne: "Apagar esta notificação"`. es: `bookingScheduled: "¡Agendado! Esperando la confirmación del barbero."`, `privacy: "Privacidad y datos"`, `clearAll: "Borrar notificaciones"`, `clearAllBody: "¿Borrar todas las notificaciones? No se puede deshacer."`, `clearAllConfirm: "Borrar todo"`, `delete: "Borrar"`, `deleteError: "No se pudo borrar."`, `deleteOne: "Borrar esta notificación"`. Update `tests/e2e/booking.web.spec.ts` lines 85 and 132: `"Booking confirmed."` → `"Booked! Waiting for the barber to confirm."`. Use `grep -n "bookingConfirmed" -r src app` to find every user.
- [ ] **Step 4: Run** — `npx jest tests/unit/notifications-delete.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: delete_notifications client call and clearer booking toast"`

---

### Task 3: Shared Settings and Privacy-and-data screens

**Files:**
- Create: `src/features/account/ProfileSettingsScreen.tsx`, `src/features/account/PrivacyDataScreen.tsx`, `tests/e2e/profile-standard.web.spec.ts`
- Modify: `app/(customer)/me/settings.tsx`, `app/(customer)/me/privacy.tsx`, `app/(barber)/my-profile/settings.tsx`, `app/(barber)/my-profile/privacy.tsx`, `app/(owner)/owner-profile/settings.tsx`, `app/(owner)/owner-profile/privacy.tsx`, `app/(barber)/my-profile/index.tsx` (menu order), `tests/e2e/profile.web.spec.ts` (download moved), role e2e that visits privacy/settings.

**Interfaces — Produces:**
```tsx
export function ProfileSettingsScreen(props: { languageHref: string }): JSX.Element
export function PrivacyDataScreen(props: { allowDelete: boolean; note?: string; testPrefix: string }): JSX.Element
```
Wrappers: customer `languageHref="/me/language"`, `allowDelete`; barber `"/my-profile/language"`, `allowDelete`; owner `"/language"`, `allowDelete={false}` with `note={t("owner.profile.privacyNote")}` and the note test id `owner-privacy-note`.

- [ ] **Step 1: Failing e2e** `profile-standard.web.spec.ts`: for each of customer, barber, owner (reuse the sign-in/mocking helpers of `profile.web.spec.ts`, `barber-side.web.spec.ts`, `owner-profile.web.spec.ts`): open the role's settings route and expect exactly one menu item (Language) and **no** `profile-export`; open privacy and expect `privacy-terms` and `profile-export` visible; customer and barber also `profile-delete`; owner has no `profile-delete` but shows `owner-privacy-note`. Clicking `profile-export` calls `rpc/export_my_data` (assert with a `waitForRequest`). Run (Expo restarted) → FAIL.
- [ ] **Step 2: Components.** `ProfileSettingsScreen` = the customer `settings.tsx` body without the export button/mutation (`ScreenHeader` + `MenuBlock` with Language → `router.push(languageHref)`). `PrivacyDataScreen` = the customer `privacy.tsx` body (header, Terms `testID="privacy-terms"`, `profile-export` button using `exportMyData`/`buildExportFile`/`saveExportFile` with a toast, and when `allowDelete` the existing confirm-delete block calling `deleteMyAccount` then `supabase.auth.signOut()` and `queryClient.clear()`); when `!allowDelete` render `<Text testID="owner-privacy-note">{note}</Text>` instead of the delete block. Keep the screen padding/`Screen`/`ScrollView` structure identical to the customer one.
- [ ] **Step 3: Wrappers.** Replace each of the six route files with a 3-line wrapper, e.g. `export default function Settings() { return <ProfileSettingsScreen languageHref="/me/language" />; }`. Remove `barber.profile.privacyNote` usage; keep `owner.profile.privacyNote` and reword it in the three locales to explain that closing the shop account is done through support ("To close the shop account, contact support.").
- [ ] **Step 4: Menu order.** In `app/(barber)/my-profile/index.tsx` swap the last block to Settings, then Privacy and data, then About (the customer and owner hubs already end that way; verify the owner one and the customer one by eye).
- [ ] **Step 5: Update old specs** — `tests/e2e/profile.web.spec.ts` (download button now under privacy), any barber/owner spec asserting `barber-privacy-note`/`barber-privacy-terms`/`owner-privacy-terms` (rename ids to `privacy-terms`).
- [ ] **Step 6: Verify** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/profile-standard.web.spec.ts tests/e2e/profile.web.spec.ts tests/e2e/barber-side.web.spec.ts tests/e2e/owner-profile.web.spec.ts` → PASS. Screenshot the three privacy screens at 375px.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: same Settings and Privacy-and-data screens for every role"`

---

### Task 4: Clear notifications (X, long-press)

**Files:**
- Create: `src/components/domain/ConfirmDialog.tsx`, `src/components/domain/NotificationActionSheet.tsx`, `tests/e2e/notifications-clear.web.spec.ts`
- Modify: `src/components/domain/ScreenHeader.tsx` (optional `right`), `src/components/domain/index.ts`, `src/features/notifications/NotificationsScreen.tsx`

**Interfaces — Produces:**
```tsx
ScreenHeaderProps += { right?: ReactNode }          // rendered after the title with flex-1 spacer; layout unchanged without it
ConfirmDialog(props: { body: string; busy?: boolean; cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void; title: string; visible: boolean })   // testIDs: confirm-dialog, confirm-dialog-confirm, confirm-dialog-cancel
NotificationActionSheet(props: { busy?: boolean; deleteLabel: string; onClose: () => void; onDelete: () => void; visible: boolean })   // testIDs: notification-sheet, notification-sheet-delete
```

- [ ] **Step 1: Failing e2e** `notifications-clear.web.spec.ts` (customer session, mock `list_my_notifications`/whatever `listNotifications` calls with three items, and `rpc/delete_notifications` recording its body; items disappear from the mocked list after the call). Tests: (a) `notifications-clear` is at the **top-right** (its bounding box right edge within 24px of the viewport width, its top within the header band) and the click opens `confirm-dialog`; cancel closes it without calling the RPC; confirm sends `{ target_ids: null }`, then the empty state shows. (b) long-press on `notification-<id>` (mouse down, wait 700ms, mouse up) opens `notification-sheet` and does **not** navigate; `notification-sheet-delete` sends `{ target_ids: [id] }`; a normal click still opens the notification target. (c) with no notifications the X is not rendered. Run → FAIL.
- [ ] **Step 2: Implement.** `ScreenHeader`: add `right`; wrap as `<View className="flex-row items-center gap-2">… <Text className="flex-1 …">title</Text>{right}</View>` (give the title `flex-1` only when `right` is present so every other screen stays pixel-identical). `ConfirmDialog` and `NotificationActionSheet`: `Modal transparent animationType="fade"` with a dimmed `Pressable` backdrop and a `bg-surface` rounded card, buttons from `Button` (confirm `variant="danger"`). `NotificationsScreen`: a `remove` mutation (`deleteNotifications`) invalidating `["notifications"]` and `["notifications-unread"]`; `const [confirmAll, setConfirmAll] = useState(false)` and `const [target, setTarget] = useState<InboxItem | null>(null)`; the X is `<Pressable testID="notifications-clear" accessibilityLabel={t("notifications.clearAll")}><X …/></Pressable>` passed as `right` only when `items.data?.length`; each card `Pressable` gets `delayLongPress={450}` and `onLongPress={() => setTarget(item)}`; errors show the `notifications.deleteError` toast.
- [ ] **Step 3: Verify** — typecheck, lint, jest; restart Expo; `npx playwright test tests/e2e/notifications-clear.web.spec.ts tests/e2e/notifications.web.spec.ts` → PASS; screenshot the screen and the dialog at 375px.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: clear notifications (X for all, long-press for one)"`

---

### Task 5: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db` (only known dev-data failures), full web e2e (`--workers=3`); push `feat-profile-notifications`; open the PR via `gh api` REST (base: `docs-ux-round3`). Deploy note: apply migration `0054` to hosted Supabase.
