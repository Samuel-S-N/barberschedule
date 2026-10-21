import { listPublicBarbers } from "../../src/features/barbers/api";

it("selects avatar_url and maps it to avatarUrl", async () => {
  const order = jest.fn().mockResolvedValue({
    data: [
      { active: true, archived_at: null, avatar_url: "https://x/y.jpg", id: "b1", name: "Ana", shop_id: "s1" },
      { active: true, archived_at: null, id: "b2", name: "Bia", shop_id: "s1" },
    ],
    error: null,
  });
  const select = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order }) });
  const supabase = { from: jest.fn().mockReturnValue({ select }), rpc: jest.fn() };

  const barbers = await listPublicBarbers(supabase as never, "s1");

  expect(select).toHaveBeenCalledWith(expect.stringContaining("avatar_url"));
  expect(barbers.map((barber) => barber.avatarUrl)).toEqual(["https://x/y.jpg", null]);
});
