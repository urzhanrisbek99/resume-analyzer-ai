import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { APP_NAME, ROUTES } from '@/shared/config/app';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — проверка резюме на совместимость с ATS`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'Разбор резюме по семи измерениям: читаемость для систем отбора, структура, достижения, совпадение с вакансией. Файл обрабатывается в браузере и никуда не отправляется.',
  applicationName: APP_NAME,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#101216' },
  ],
};

/**
 * The two modes the product has. Kept here rather than in a widget: it is the
 * application shell, not a reusable block, and nothing below the app layer
 * should know how many routes exist.
 */
const NAV = [
  { href: ROUTES.candidate, label: 'Проверить резюме' },
  { href: ROUTES.recruiter, label: 'Скрининг кандидатов' },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <a
          href="#content"
          className="surface-raised focus:shadow-raised sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm"
        >
          Перейти к содержимому
        </a>

        <header className="surface-raised sticky top-0 z-40 border-b border-[var(--border-subtle)]">
          <nav
            aria-label="Основная навигация"
            className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6"
          >
            <Link href={ROUTES.home} className="text-[0.9375rem] font-semibold tracking-tight">
              {APP_NAME}
            </Link>

            <ul className="ml-auto flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-secondary hover:surface-sunken rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors hover:text-[var(--text-primary)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <div id="content">{children}</div>
      </body>
    </html>
  );
}
