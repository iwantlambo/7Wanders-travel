import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wandr — Europe Travel Assistant',
  description: 'AI-powered Europe travel planner with smart weather routing, hidden gems, and group trips.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
