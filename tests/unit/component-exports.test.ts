import * as ui from "../../src/components/ui";
import * as domain from "../../src/components/domain";

describe("component barrel exports", () => {
  it("exports every base component", () => {
    expect(ui.Button).toBeDefined();
    expect(ui.Input).toBeDefined();
    expect(ui.Card).toBeDefined();
  });

  it("exports every domain component", () => {
    expect(domain.StatusBadge).toBeDefined();
    expect(domain.RatingStars).toBeDefined();
    expect(domain.BarberCard).toBeDefined();
    expect(domain.ServiceCard).toBeDefined();
    expect(domain.CalendarStrip).toBeDefined();
    expect(domain.TimeSlotPicker).toBeDefined();
    expect(domain.AppointmentCard).toBeDefined();
    expect(domain.EmptyState).toBeDefined();
    expect(domain.Toast).toBeDefined();
    expect(domain.SkeletonBlock).toBeDefined();
    expect(domain.SkeletonCircle).toBeDefined();
    expect(domain.SkeletonText).toBeDefined();
  });
});
