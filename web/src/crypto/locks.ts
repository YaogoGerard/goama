/** Serialise cryptographic state changes in this tab and, when supported, across tabs. */
const localQueues = new Map<string, Promise<void>>()

export async function withCryptoLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  const previous = localQueues.get(name) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  localQueues.set(name, current)
  await previous
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request(`goama-crypto:${name}`, action)
    }
    return await action()
  } finally {
    release()
    if (localQueues.get(name) === current) localQueues.delete(name)
  }
}
