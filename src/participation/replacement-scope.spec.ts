import { DataSource } from "typeorm";
import { loadReplacementContext } from "./replacement-scope";

const actor = "11111111-1111-4111-8111-111111111111";
const incidentId = "22222222-2222-4222-8222-222222222222";
function fixture(activeIncidentCount = 3, replacementFrom = 3) {
  const query = jest.fn(async () => [
    {
      id: incidentId,
      leadInstructorId: actor,
      activeIncidentCount,
      policySnapshot: JSON.stringify({ replacementFrom }),
    },
  ]);
  return { db: { query } as unknown as DataSource, query };
}
it("rejects a historical replacement flag after exemptions reduce valid incidents below its original threshold", async () => {
  const f = fixture(1);
  await expect(
    loadReplacementContext(f.db, actor, incidentId, false),
  ).rejects.toMatchObject({
    response: expect.objectContaining({
      code: "REPLACEMENT_THRESHOLD_NOT_MET",
    }),
  });
});
it("uses the incident policy snapshot and exposes current evidence for later fingerprint checks", async () => {
  const f = fixture(3, 3);
  await expect(
    loadReplacementContext(f.db, actor, incidentId, false),
  ).resolves.toMatchObject({
    activeIncidentCount: 3,
    replacementFrom: 3,
  });
});
it("denies a foreign owner before revealing threshold evidence", async () => {
  const f = fixture(1);
  await expect(
    loadReplacementContext(f.db, incidentId, incidentId, false),
  ).rejects.toMatchObject({ status: 403 });
});
it.each(["invalid", "{}", '{"replacementFrom":0}'])(
  "fails closed on corrupt policy snapshot %s",
  async (policySnapshot) => {
    const f = fixture();
    f.query.mockResolvedValue([
      {
        id: incidentId,
        leadInstructorId: actor,
        activeIncidentCount: 3,
        policySnapshot,
      },
    ]);
    await expect(
      loadReplacementContext(f.db, actor, incidentId, true),
    ).rejects.toMatchObject({ status: 409 });
  },
);
