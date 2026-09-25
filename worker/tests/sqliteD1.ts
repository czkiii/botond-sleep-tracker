import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'

export function sqliteBinding(sqlite: DatabaseSync): D1Database {
  class Statement {
    private values: SQLInputValue[] = []
    constructor(private sql: string) {}
    bind(...values: SQLInputValue[]) { this.values = values; return this }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.values) } }
    async run() {
      // D1 counts trigger and foreign-key cascade changes as well as direct writes.
      const totalChanges = () => Number(sqlite.prepare('SELECT total_changes() AS n').get()!.n)
      const before = totalChanges()
      sqlite.prepare(this.sql).run(...this.values)
      return { success: true, meta: { changes: totalChanges() - before } }
    }
  }
  return {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    }
  } as unknown as D1Database
}
