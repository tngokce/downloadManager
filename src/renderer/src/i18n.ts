import { useCallback } from 'react'
import { displayName, translate, translateError, type I18nKey } from '@shared/i18n'
import type { Language } from '@shared/types'
import { useStore } from './store'

export type TFn = (key: I18nKey, vars?: Record<string, string | number>) => string

export function useLang(): Language {
  return useStore().settings?.language ?? 'tr'
}

export function useT(): TFn {
  const lang = useLang()
  return useCallback((key, vars) => translate(lang, key, vars), [lang])
}

export function useI18n() {
  const lang = useLang()
  return {
    lang,
    t: ((key, vars) => translate(lang, key, vars)) as TFn,
    err: (code?: string) => translateError(lang, code),
    cat: (c: { id: string; name: string; builtin?: boolean }) => displayName(lang, 'cat', c),
    queue: (q: { id: string; name: string; builtin?: boolean }) => displayName(lang, 'queue', q)
  }
}
