import { requestDisplayStatus } from "../../src/features/recurrence/requests-api";

describe("requestDisplayStatus", () => {
  it("an accepted request whose series is running is active", () => {
    expect(requestDisplayStatus({ cancelRequestedAt: null, seriesEndedAt: null, status: "accepted" })).toBe("active");
  });

  it("a running series with a cancellation request is cancel_requested", () => {
    expect(requestDisplayStatus({ cancelRequestedAt: "2026-10-21T15:00:00Z", seriesEndedAt: null, status: "accepted" })).toBe("cancel_requested");
  });

  it("an accepted request whose series ended is ended, not active", () => {
    expect(requestDisplayStatus({ cancelRequestedAt: null, seriesEndedAt: "2026-10-21T12:12:00Z", status: "accepted" })).toBe("ended");
  });

  it("the other statuses map to themselves", () => {
    expect(requestDisplayStatus({ cancelRequestedAt: null, seriesEndedAt: null, status: "pending" })).toBe("pending");
    expect(requestDisplayStatus({ cancelRequestedAt: null, seriesEndedAt: null, status: "rejected" })).toBe("rejected");
    expect(requestDisplayStatus({ cancelRequestedAt: null, seriesEndedAt: null, status: "cancelled" })).toBe("cancelled");
  });
});
