import type { Metadata } from 'next';
import { DashboardProvider } from '@/components/layout/DashboardLayout';
import './globals.css';

export const metadata: Metadata = {
  title: 'CLS Marketing Dashboard',
  description: 'Performance marketing analytics dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <DashboardProvider>
          {children}
        </DashboardProvider>
      </body>
    </html>
  );
}
