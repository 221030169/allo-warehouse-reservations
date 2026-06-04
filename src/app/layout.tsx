import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Allo Fulfillment | Real-Time Inventory & Reservations',
  description: 'A premium, concurrency-safe inventory reservation system for multi-warehouse retail and D2C brands.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <body className="min-h-full flex flex-col antialiased grid-bg">
        {/* Navigation Header */}
        <header className="sticky top-0 z-40 w-full glass-card border-b border-white/5 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <span className="font-extrabold text-white text-lg tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>A</span>
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-white" style={{ fontFamily: 'var(--font-display)' }}>
                  Allo<span className="text-violet-400">.</span>
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-full">
                  Fulfillment
                </span>
              </div>
            </div>
            <nav className="flex items-center space-x-4">
              <span className="text-xs font-medium text-slate-400 flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-dot"></span>
                <span>System Active</span>
              </span>
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="w-full py-6 border-t border-white/5 bg-slate-950/20 text-center">
          <p className="text-xs text-slate-500">
            &copy; 2026 Allo Fulfillment Engine. Concurrency-Safe Inventory Control.
          </p>
        </footer>
      </body>
    </html>
  );
}
