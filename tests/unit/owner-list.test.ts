import { splitByActive } from "../../src/features/professionals/owner-list";

it("splits active and inactive keeping order", () => {
  const out = splitByActive([{ active: true, id: 1 }, { active: false, id: 2 }, { active: true, id: 3 }]);

  expect(out.active.map((professional) => professional.id)).toEqual([1, 3]);
  expect(out.inactive.map((professional) => professional.id)).toEqual([2]);
});
