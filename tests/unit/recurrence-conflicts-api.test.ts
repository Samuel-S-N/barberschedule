import { listOwnerRecurrenceConflicts, resolveRecurrenceConflict } from "../../src/features/recurrence/api";

it("maps the barber and barber-service ids of a conflict", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{ barber_id: "b1", barber_service_id: "bs1", customer_name: "Ana", customer_phone: null, id: "c1", local_start_time: "10:00:00", occurrence_date: "2026-11-09", reason: "SLOT_UNAVAILABLE", series_id: "s1", service_name: "Cut", status: "open" }],
    error: null,
  });

  expect(await listOwnerRecurrenceConflicts({ rpc } as never, "shop1")).toEqual([
    { barberId: "b1", barberServiceId: "bs1", customerName: "Ana", customerPhone: null, id: "c1", localStartTime: "10:00", occurrenceDate: "2026-11-09", reason: "SLOT_UNAVAILABLE", seriesId: "s1", serviceName: "Cut", status: "open" },
  ]);
});

it("dismisses (no new time) or reschedules (ISO instant) a conflict", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await resolveRecurrenceConflict({ rpc } as never, { id: "c1", startsAt: null });
  expect(rpc).toHaveBeenLastCalledWith("resolve_recurrence_conflict", { new_starts_at: null, target_conflict_id: "c1" });
  await resolveRecurrenceConflict({ rpc } as never, { id: "c1", startsAt: "2026-11-10T14:00:00Z" });
  expect(rpc).toHaveBeenLastCalledWith("resolve_recurrence_conflict", { new_starts_at: "2026-11-10T14:00:00Z", target_conflict_id: "c1" });
});

it("maps an already resolved conflict", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0035" } });

  await expect(resolveRecurrenceConflict({ rpc } as never, { id: "c1", startsAt: null })).rejects.toMatchObject({ code: "RECURRENCE_CONFLICT_RESOLVED" });
});
