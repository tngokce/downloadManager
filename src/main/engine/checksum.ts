import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { HashAlgorithm } from '@shared/types'

export async function hashFile(path: string, algorithm: HashAlgorithm, signal?: AbortSignal): Promise<string> {
  const hash = createHash(algorithm)
  const stream = createReadStream(path, { highWaterMark: 1024 * 1024, signal })
  for await (const chunk of stream) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Uzunluğa göre algoritma tahmini (kullanıcı yalnızca hash yapıştırdığında) */
export function guessAlgorithm(hex: string): HashAlgorithm | null {
  const h = hex.trim()
  if (!/^[0-9a-f]+$/i.test(h)) return null
  return ({ 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' } as const)[h.length as 32 | 40 | 64 | 128] ?? null
}
