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
      const result = sqlite.prepare(this.sql).run(...this.values)
      return { success: true, meta: { changes: Number(result.changes) } }
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
