import { listPlansForBarber, listRecurrencePlans, planTitle, saveRecurrencePlan } from "../../src/features/recurrence/plans-api";

const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key}${JSON.stringify(options)}` : key)) as never;

it("lists plans for the owner", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ active: true, id: "p1", interval_weeks: 3, name: "Trimestral", normal_cents: 3500, price_cents: 4500, service_id: "s1", service_name: "Cut" }], error: null });

  expect(await listRecurrencePlans({ rpc } as never, "shop1")).toEqual([{ active: true, id: "p1", name: "Trimestral", normalCents: 3500, priceCents: 4500, serviceId: "s1", serviceName: "Cut", weeks: 3 }]);
  expect(rpc).toHaveBeenCalledWith("list_recurrence_plans", { target_shop_id: "shop1" });
});

it("saves a plan (create and edit)", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await saveRecurrencePlan({ rpc } as never, { active: true, id: null, name: " Mensal ", priceCents: 2500, serviceId: "s1", weeks: 1 });
  expect(rpc).toHaveBeenLastCalledWith("save_recurrence_plan", { target_active: true, target_interval_weeks: 1, target_name: "Mensal", target_plan_id: null, target_price_cents: 2500, target_service_id: "s1" });
  await saveRecurrencePlan({ rpc } as never, { active: false, id: "p1", name: " Corte + Barba ", priceCents: 0, serviceId: "s1", weeks: 2 });
  expect(rpc).toHaveBeenLastCalledWith("save_recurrence_plan", { target_active: false, target_interval_weeks: 2, target_name: "Corte + Barba", target_plan_id: "p1", target_price_cents: 0, target_service_id: "s1" });
});

it("lists a barber's plans for customers", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ barber_service_id: "bs1", interval_weeks: 1, name: "Corte mensal", normal_cents: 3500, plan_id: "p1", price_cents: 2500, service_name: "Cut" }], error: null });

  expect(await listPlansForBarber({ rpc } as never, "b1")).toEqual([{ barberServiceId: "bs1", name: "Corte mensal", normalCents: 3500, planId: "p1", priceCents: 2500, serviceName: "Cut", weeks: 1 }]);
  expect(rpc).toHaveBeenCalledWith("list_recurrence_plans_for_barber", { target_barber_id: "b1" });
});

it("a plan's title is its name", () => {
  expect(planTitle({ name: "Trimestral" })).toBe("Trimestral");
});

it("maps a duplicate plan to RECURRENCE_PLAN_DUPLICATE", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0033" } });

  await expect(saveRecurrencePlan({ rpc } as never, { active: true, id: null, name: "Plano", priceCents: 1, serviceId: "s1", weeks: 1 })).rejects.toMatchObject({ code: "RECURRENCE_PLAN_DUPLICATE" });
});

it("maps a missing title to RECURRENCE_PLAN_NAME_REQUIRED", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0034" } });

  await expect(saveRecurrencePlan({ rpc } as never, { active: true, id: null, name: "", priceCents: 1, serviceId: "s1", weeks: 1 })).rejects.toMatchObject({ code: "RECURRENCE_PLAN_NAME_REQUIRED" });
});
