import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

import { Toaster } from '@/components/ui/toaster';
import './globals.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth/auth-context';
import { LoginDialog } from '@/components/auth/login-dialog';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { BackgroundMusic } from '@/components/ui/background-music';
import { SecurityGuard } from '@/components/security-guard';
import NextTopLoader from 'nextjs-toploader';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf8f2' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1917' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'ConceptNichod',
  description: 'AI-powered learning and concept mastery.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
        <Script 
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4590877037311160"
          strategy="lazyOnload"
          crossOrigin="anonymous" 
        />
      </head>
      <body className="font-body antialiased relative min-h-screen overflow-x-hidden selection:bg-primary/20">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          themes={["light", "dark", "midnight-neon", "sunset-amber", "forest-emerald", "cyberpunk-indigo"]}
        >
          <NextTopLoader color="hsl(var(--primary))" showSpinner={false} />
          <SecurityGuard />
          <AnimatedBackground />
          <BackgroundMusic />
          <AuthProvider>
            {children}
            <LoginDialog />
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
