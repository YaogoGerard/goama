import Olm from '@matrix-org/olm'
import olmWasmUrl from '@matrix-org/olm/olm.wasm?url'

interface RuntimeApi {
  init(options?: { locateFile?: (path: string) => string }): Promise<void>
}

export const olmRuntime = Olm as unknown as RuntimeApi
let initialization: Promise<void> | null = null

export function ensureOlmRuntime(): Promise<void> {
  if (!initialization) {
    initialization = olmRuntime.init({ locateFile: () => olmWasmUrl }).catch((error) => {
      initialization = null
      throw error
    })
  }
  return initialization
}
