import { updateMyStaffProfile } from "../../src/features/account/api";

it("sends the name and a trimmed nickname", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await updateMyStaffProfile({ rpc } as never, { fullName: "Olivia Owner", nickname: " Liv " });
  expect(rpc).toHaveBeenCalledWith("update_my_staff_profile", { p_full_name: "Olivia Owner", p_nickname: "Liv" });
});

it("sends null for an empty nickname", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await updateMyStaffProfile({ rpc } as never, { fullName: "Olivia", nickname: "  " });
  expect(rpc).toHaveBeenCalledWith("update_my_staff_profile", { p_full_name: "Olivia", p_nickname: null });
});

it("maps a rejected profile to PROFILE_INVALID", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0017" } });

  await expect(updateMyStaffProfile({ rpc } as never, { fullName: "", nickname: null })).rejects.toMatchObject({ code: "PROFILE_INVALID" });
});
