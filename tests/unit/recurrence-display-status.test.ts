import { requestDisplayStatus } from "../../src/features/recurrence/requests-api";

describe("requestDisplayStatus", () => {
  it("an accepted request whose series is running is active", () => {
    expect(requestDisplayStatus({ seriesEndedAt: null, status: "accepted" })).toBe("active");
  });

  it("an accepted request whose series ended is ended, not active", () => {
    expect(requestDisplayStatus({ seriesEndedAt: "2026-10-21T12:12:00Z", status: "accepted" })).toBe("ended");
  });

  it("the other statuses map to themselves", () => {
    expect(requestDisplayStatus({ seriesEndedAt: null, status: "pending" })).toBe("pending");
    expect(requestDisplayStatus({ seriesEndedAt: null, status: "rejected" })).toBe("rejected");
    expect(requestDisplayStatus({ seriesEndedAt: null, status: "cancelled" })).toBe("cancelled");
  });
});
