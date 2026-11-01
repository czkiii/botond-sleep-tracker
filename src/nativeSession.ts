export type NativeSessionData = { account: { id: string; email: string | null; name: string | null };
  deviceId: string; accessToken: string; accessExpiresAt: number; expiresAt: number; refreshToken: string }
export type NativeVaultRecord = { marker: string; installationSecret: string; refreshToken: string | null }
export type NativeSessionDependencies = {
  read(): Promise<NativeVaultRecord | null>
  write(record: NativeVaultRecord): Promise<void>
  marker(): string
  disabled(): boolean
  disable(value: boolean): void
  randomSecret(): string
  post<T>(path: string, body: object): Promise<T>
}
export class NativeSessionError extends Error {
  constructor(readonly code: string, readonly status?: number, readonly data?: unknown) { super(code) }
}
export class NativeSession {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly deps: NativeSessionDependencies) {}
  private serial<T>(action: () => Promise<T>) {
    const next = this.queue.then(action, action)
    this.queue = next.catch(() => {})
    return next
  }
  private async record() {
    const record = await this.deps.read()
    if (record && record.marker === this.deps.marker() && /^[a-f0-9]{64}$/.test(record.installationSecret)) return record
    // iOS Keychain can survive reinstall. A fresh app container never restores
    // the old account/session; it must authenticate again.
    const fresh = { marker: this.deps.marker(), installationSecret: this.deps.randomSecret(), refreshToken: null }
    await this.deps.write(fresh)
    return fresh
  }
  installationSecret() { return this.serial(async () => (await this.record()).installationSecret) }
  accept(data: NativeSessionData, check: () => void) {
    return this.serial(async () => {
      check()
      if (!/^[a-f0-9]{64}$/.test(data.refreshToken) || !data.account?.id || !data.accessToken) throw new NativeSessionError('SESSION_INVALID', 401)
      const record = await this.record(); check()
      await this.deps.write({ ...record, refreshToken: data.refreshToken })
      try { check() } catch (error) { this.deps.disable(true); throw error }
      this.deps.disable(false)
      const { refreshToken: _, ...access } = data
      return access
    })
  }
  refresh(check: () => void) {
    return this.serial(async () => {
      check()
      if (this.deps.disabled()) throw new NativeSessionError('SESSION_INVALID', 401)
      const record = await this.record(); check()
      if (!record.refreshToken) throw new NativeSessionError('SESSION_INVALID', 401)
      // A lost response must not replay a rotated refresh token. Persist its
      // removal BEFORE the request; on ambiguity require sign-in, preserve diary.
      await this.deps.write({ ...record, refreshToken: null }); check()
      const data = await this.deps.post<NativeSessionData>('/v1/auth/native/refresh', { refreshToken: record.refreshToken })
      check()
      if (!/^[a-f0-9]{64}$/.test(data.refreshToken) || !data.account?.id || !data.accessToken) throw new NativeSessionError('SESSION_INVALID', 401)
      await this.deps.write({ ...record, refreshToken: data.refreshToken })
      try { check() } catch (error) { this.deps.disable(true); throw error }
      const { refreshToken: _, ...access } = data
      return access
    })
  }
  logout(check: () => void) {
    return this.serial(async () => {
      const record = await this.record(); check()
      if (record.refreshToken) await this.deps.post('/v1/auth/native/logout', { refreshToken: record.refreshToken })
      check(); this.deps.disable(true)
      await this.deps.write({ ...record, refreshToken: null })
    })
  }
  invalidate() {
    this.deps.disable(true) // immediate barrier even if secure storage is locked
    return this.serial(async () => {
      const record = await this.record()
      await this.deps.write({ ...record, refreshToken: null })
    })
  }
}
