import { GithubApiError, GithubClient } from "./github-client";
afterEach(() => jest.restoreAllMocks());
it("requires an explicit 201 or 204 for collaborator creation rather than treating an arbitrary successful JSON response as proof", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ id: 50 }), { status: 200 }),
    );
  await expect(
    new GithubClient().call(
      "/repos/platform/demo/collaborators/student",
      "fixture",
      "PUT",
      { permission: "push" },
      [201, 204],
    ),
  ).rejects.toMatchObject({ upstreamStatus: 200 });
});
it.each([201, 204])(
  "retains the exact documented collaborator success semantics for %s",
  async (status) => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(status === 204 ? null : JSON.stringify({ id: 50 }), {
          status,
        }),
      );
    await expect(
      new GithubClient().call(
        "/repos/platform/demo/collaborators/student",
        "fixture",
        "PUT",
        { permission: "push" },
        [201, 204],
      ),
    ).resolves.toEqual(status === 204 ? undefined : { id: 50 });
  },
);
it("preserves normal GET responses and existing error classification", async () => {
  const fetch = jest.spyOn(global, "fetch");
  fetch
    .mockResolvedValueOnce(new Response('{"id":99}', { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  const client = new GithubClient();
  await expect(client.call("/repositories/99", "fixture")).resolves.toEqual({
    id: 99,
  });
  await expect(
    client.call("/repositories/99", "fixture"),
  ).rejects.toBeInstanceOf(GithubApiError);
});
