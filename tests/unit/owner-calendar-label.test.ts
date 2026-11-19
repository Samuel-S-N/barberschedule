import i18n from "../../src/i18n";

describe("owner calendar naming", () => {
  it("English owner tab and titles say Calendar; the shared tab key still says Agenda", async () => {
    await i18n.changeLanguage("en");

    expect(i18n.t("tabs.calendar")).toBe("Calendar");
    expect(i18n.t("owner.agenda.titleDay")).toBe("Day calendar");
    expect(i18n.t("owner.agenda.titleWeek")).toBe("Week calendar");
    expect(i18n.t("owner.agenda.titleMonth")).toBe("Month calendar");
    expect(i18n.t("tabs.agenda")).toBe("Agenda");
  });

  it.each(["pt", "es"])("%s keeps Agenda", async (language) => {
    await i18n.changeLanguage(language);

    expect(i18n.t("tabs.calendar")).toBe("Agenda");
  });
});
