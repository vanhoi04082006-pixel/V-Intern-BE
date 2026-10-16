import { createDatabaseSql } from './create-database-sql';

describe('database file storage', () => {
  it('preserves server defaults when no operator directory is configured', () => {
    expect(createDatabaseSql('VIntern_E2E_CI')).toBe("IF DB_ID(N'VIntern_E2E_CI') IS NULL CREATE DATABASE [VIntern_E2E_CI];");
  });
  it('places both files inside the requested Windows directory', () => {
    const sql = createDatabaseSql('VIntern_E2E_Storage', 'E:\\Projects\\V-INTERN\\.runtime\\sql');
    expect(sql).toContain("FILENAME=N'E:\\Projects\\V-INTERN\\.runtime\\sql\\VIntern_E2E_Storage.mdf'");
    expect(sql).toContain("FILENAME=N'E:\\Projects\\V-INTERN\\.runtime\\sql\\VIntern_E2E_Storage_log.ldf'");
    expect(sql).not.toContain('C:');
  });
  it('supports server-local POSIX directories and escapes SQL string values', () => {
    const sql = createDatabaseSql('VIntern_E2E_Storage', "/var/opt/vintern's/data");
    expect(sql).toContain("FILENAME=N'/var/opt/vintern''s/data/VIntern_E2E_Storage.mdf'");
    expect(sql).toContain("FILENAME=N'/var/opt/vintern''s/data/VIntern_E2E_Storage_log.ldf'");
  });
  it.each(['', 'bad-name', 'a b', 'a'.repeat(129), "x']; DROP DATABASE master;--"])('rejects unsafe database name %p before producing DDL', name => {
    expect(() => createDatabaseSql(name, 'E:\\Project\\sql')).toThrow();
  });
  it.each(['../outside', 'E:relative', '\\\\server\\share', 'E:\\project\\..\\other', '/var/\0/sql'])('rejects ambiguous or unsafe server directory %p', directory => {
    expect(() => createDatabaseSql('VIntern_E2E_Storage', directory)).toThrow();
  });
});
