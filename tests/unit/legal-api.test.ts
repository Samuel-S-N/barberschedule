import { acceptLegalDocuments, listMyConsents } from "../../src/features/legal/api";
import { LEGAL_VERSIONS } from "../../src/features/legal";

it("listMyConsents reads kind and version of the caller's consents", async () => {
  const select = jest.fn().mockResolvedValue({ data: [{ kind: "terms", version: "2026-11-26" }], error: null });
  const supabase = { from: jest.fn(() => ({ select })) };

  expect(await listMyConsents(supabase as never)).toEqual([{ kind: "terms", version: "2026-11-26" }]);
  expect(supabase.from).toHaveBeenCalledWith("consents");
  expect(select).toHaveBeenCalledWith("kind, version");
});

it("acceptLegalDocuments sends the current version of each kind", async () => {
  const rpc = jest.fn().mockResolvedValue({ error: null });

  await acceptLegalDocuments({ rpc } as never, ["terms", "privacy"]);

  expect(rpc).toHaveBeenCalledWith("accept_legal_documents", {
    p_documents: [{ kind: "terms", version: LEGAL_VERSIONS.terms }, { kind: "privacy", version: LEGAL_VERSIONS.privacy }],
  });
});

it("acceptLegalDocuments throws the domain error", async () => {
  const rpc = jest.fn().mockResolvedValue({ error: { code: "P0046" } });

  await expect(acceptLegalDocuments({ rpc } as never, ["terms"])).rejects.toMatchObject({ code: "LEGAL_CONSENT_INVALID" });
});
