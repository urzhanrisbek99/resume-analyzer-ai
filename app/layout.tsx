import type { Metadata, Viewport } from 'next';

import { APP_NAME } from '@/shared/config/app';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <a
          href="#content"
          className="surface-raised sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:shadow-raised"
        >
          Перейти к содержимому
        </a>
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
