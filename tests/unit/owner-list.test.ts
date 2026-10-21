import { splitByActive } from "../../src/features/barbers/owner-list";

it("splits active and inactive keeping order", () => {
  const out = splitByActive([{ active: true, id: 1 }, { active: false, id: 2 }, { active: true, id: 3 }]);

  expect(out.active.map((barber) => barber.id)).toEqual([1, 3]);
  expect(out.inactive.map((barber) => barber.id)).toEqual([2]);
});
