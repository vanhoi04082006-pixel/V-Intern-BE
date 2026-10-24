import { PermissionsService } from "./permissions.service";
import type { Repository } from "typeorm";
import type { UserRole } from "./entities/user-role.entity";

it("reads a fresh complete access snapshot in one database round trip, including roles without permissions", async () => {
  const query = jest
    .fn()
    .mockResolvedValueOnce([
      { roleCode: "intern", permissionCode: "recruitment.start.own" },
      { roleCode: "intern", permissionCode: "recruitment.start.own" },
      { roleCode: "observer", permissionCode: null },
    ])
    .mockResolvedValueOnce([]);
  const other = { find: jest.fn().mockResolvedValue([]) };
  const service = new PermissionsService(
    { query } as unknown as Repository<UserRole>,
    other as never,
    other as never,
    other as never,
    other as never,
    other as never,
  );
  const first = await service.accessSnapshot("actor");
  expect([...first.roles].sort()).toEqual(["intern", "observer"]);
  expect([...first.permissions]).toEqual(["recruitment.start.own"]);
  expect(query).toHaveBeenCalledTimes(1);
  const revoked = await service.accessSnapshot("actor");
  expect(revoked.roles.size).toBe(0);
  expect(revoked.permissions.size).toBe(0);
  expect(query).toHaveBeenCalledTimes(2);
  expect(other.find).not.toHaveBeenCalled();
});
