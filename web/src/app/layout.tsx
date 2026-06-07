import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '../components/AppShell';

export const metadata: Metadata = {
  title: 'World Cup 2026 Predictor',
  description: 'Predict World Cup 2026 results and compete with friends',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
