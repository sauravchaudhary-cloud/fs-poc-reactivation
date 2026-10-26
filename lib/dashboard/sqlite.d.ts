// Node 22's built-in SQLite, which @types/node 20 doesn't describe yet: just what db.ts uses. Delete this file once
// @types/node is 22 or later.
declare module "node:sqlite" {
  type Value = null | number | bigint | string | Uint8Array;
  export class StatementSync {
    run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: Value[]): unknown;
    all(...params: Value[]): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
