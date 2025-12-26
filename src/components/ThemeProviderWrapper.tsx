'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export default function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  )
}

