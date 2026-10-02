import { barberReportCsv, ownerReportCsv, toCsv } from "../../src/features/reports/csv";

const BOM = "﻿";

describe("toCsv", () => {
  it("uses ; as delimiter, CRLF rows and a BOM so Brazilian Excel opens it directly", () => {
    expect(toCsv([["a", "b"], ["1", "2"]])).toBe(`${BOM}a;b\r\n1;2`);
  });

  it("quotes cells with delimiter, quotes or line breaks, and doubles inner quotes", () => {
    expect(toCsv([['He said "hi"', "a;b", "line\nbreak", "plain"]])).toBe(`${BOM}"He said ""hi""";"a;b";"line\nbreak";plain`);
  });

  it("neutralises spreadsheet formulas in text cells", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-1", "@x", "ok"]])).toBe(`${BOM}'=SUM(A1);'+1;'-1;'@x;ok`);
  });
});

const labels = {
  barber: "Barber", barberShare: "Barber share", cancelled: "Cancelled", completed: "Completed", date: "Date", earnings: "Earnings",
  noShow: "No-show", rentEstimate: "Rent (estimate)", rentPaid: "Rent paid", revenue: "Revenue", service: "Service", upcoming: "Upcoming",
};

describe("ownerReportCsv", () => {
  it("writes days, barbers and services with decimal-comma amounts", () => {
    const csv = ownerReportCsv(
      {
        barbers: [{ barberId: "b", barberShareCents: 5000, compensationType: "chair_rental", completed: 1, grossCents: 5000, name: "Bruno", rentEstimateCents: 7000, rentPaidCents: 5000 }],
        days: [{ cancelled: 1, completed: 4, date: "2026-10-01", grossCents: 16000, noShow: 0, upcoming: 2 }],
        services: [{ completed: 3, grossCents: 11000, name: "Cut; Beard", serviceId: "s" }],
      },
      labels,
    );

    expect(csv).toBe([
      `${BOM}Date;Completed;Cancelled;No-show;Upcoming;Revenue`,
      "2026-10-01;4;1;0;2;160,00",
      "",
      "Barber;Completed;Revenue;Barber share;Rent (estimate);Rent paid",
      "Bruno;1;50,00;50,00;70,00;50,00",
      "",
      "Service;Completed;Revenue",
      '"Cut; Beard";3;110,00',
    ].join("\r\n"));
  });
});

describe("barberReportCsv", () => {
  it("writes the barber's own days", () => {
    const csv = barberReportCsv({ days: [{ cancelled: 0, completed: 2, date: "2026-10-01", earningsCents: 8000, noShow: 1, upcoming: 0 }], services: [{ completed: 2, name: "Cut", serviceId: "s" }] }, labels);

    expect(csv).toBe([
      `${BOM}Date;Completed;Cancelled;No-show;Upcoming;Earnings`,
      "2026-10-01;2;0;1;0;80,00",
      "",
      "Service;Completed",
      "Cut;2",
    ].join("\r\n"));
  });
});
