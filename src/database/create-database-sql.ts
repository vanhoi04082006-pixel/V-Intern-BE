import * as path from 'node:path';

/** Directory is on the SQL Server host; operator configuration, never request input. */
export function createDatabaseSql(name: string, filesRoot?: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name)) throw new Error('Unsafe database name.');
  const create = `IF DB_ID(N'${name}') IS NULL CREATE DATABASE [${name}]`;
  if (!filesRoot) return create + ';';
  if (/[\u0000-\u001f]/.test(filesRoot) || filesRoot.startsWith('\\\\') || filesRoot.startsWith('//') || filesRoot.split(/[\\/]/).includes('..')) throw new Error('SQL file directory must be an absolute local server path without traversal.');
  const windows = /^[A-Za-z]:[\\/]/.test(filesRoot);
  if (!windows && !filesRoot.startsWith('/')) throw new Error('SQL file directory must be absolute.');
  const join = windows ? path.win32.join : path.posix.join;
  const literal = (file: string) => `N'${file.replace(/'/g, "''")}'`;
  return `${create} ON PRIMARY (NAME=N'data',FILENAME=${literal(join(filesRoot, name + '.mdf'))}) LOG ON (NAME=N'log',FILENAME=${literal(join(filesRoot, name + '_log.ldf'))});`;
}
