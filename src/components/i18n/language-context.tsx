'use client'

import { createContext, ReactNode, useContext } from 'react'
import { Lang } from '@/lib/i18n'

const LangContext = createContext<Lang>('tr')

export function LanguageProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useLang(): Lang {
  return useContext(LangContext)
}

