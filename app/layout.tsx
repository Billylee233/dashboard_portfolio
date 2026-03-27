import type { Metadata } from 'next';
import { DashboardProvider } from '@/components/layout/DashboardLayout';
import './globals.css';

export const metadata: Metadata = {
  title: 'Demo Dashboard',
  description: 'Performance marketing analytics dashboard',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
        <meta name="googlebot" content="noindex, nofollow" />
      </head>
      <body>
        <DashboardProvider>
          {children}
        </DashboardProvider>
      </body>
    </html>
  );
}
