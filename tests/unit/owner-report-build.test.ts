import { barberRows, sumShopReport, topByValue, type ShopReport } from "../../src/features/owner-reports/build";

const report: ShopReport = {
  barbers: [
    { barberId: "a", barberShareCents: 4400, compensationType: "commission", completed: 3, grossCents: 11000, name: "Ana", rentEstimateCents: 0 },
    { barberId: "b", barberShareCents: 5000, compensationType: "chair_rental", completed: 1, grossCents: 5000, name: "Bruno", rentEstimateCents: 7000 },
    { barberId: "d", barberShareCents: 0, compensationType: "chair_rental", completed: 0, grossCents: 0, name: "Davi", rentEstimateCents: 7000 },
  ],
  days: [
    { cancelled: 0, completed: 3, date: "2026-09-29", grossCents: 12000, noShow: 0, upcoming: 0 },
    { cancelled: 1, completed: 1, date: "2026-09-30", grossCents: 4000, noShow: 1, upcoming: 2 },
  ],
  services: [],
};

describe("sumShopReport", () => {
  it("adds up revenue, shares, rent and shop income", () => {
    expect(sumShopReport(report)).toEqual({
      barberShareCents: 9400, cancelled: 1, cancellationRate: 0.333_333_333_333_333_3, completed: 4,
      grossCents: 16000, noShow: 1, rentEstimateCents: 14000, shopIncomeCents: 20600,
    });
  });

  it("has no cancellation rate when nothing was closed", () => {
    expect(sumShopReport({ barbers: [], days: [], services: [] }).cancellationRate).toBeNull();
  });
});

describe("barberRows", () => {
  it("adds each barber's shop share: revenue minus their share plus rent", () => {
    expect(barberRows(report).map((r) => [r.name, r.shopShareCents])).toEqual([["Ana", 6600], ["Bruno", 7000], ["Davi", 7000]]);
  });
});

describe("topByValue", () => {
  const items = [
    { key: "a", name: "A", value: 50 }, { key: "b", name: "B", value: 30 }, { key: "c", name: "C", value: 20 },
    { key: "d", name: "D", value: 10 }, { key: "e", name: "E", value: 5 }, { key: "f", name: "F", value: 5 },
  ];

  it("keeps the top N by value and folds the tail into other", () => {
    const out = topByValue(items, 4);

    expect(out.map((i) => i.key)).toEqual(["a", "b", "c", "d", "other"]);
    expect(out.at(-1)).toEqual({ key: "other", name: "", value: 10 });
  });

  it("ignores zero-value items and adds no other slice when everything fits", () => {
    expect(topByValue([{ key: "a", name: "A", value: 5 }, { key: "z", name: "Z", value: 0 }], 4).map((i) => i.key)).toEqual(["a"]);
  });
});
