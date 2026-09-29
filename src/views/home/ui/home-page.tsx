import {
  ArrowRight,
  Columns2,
  FileSearch,
  Gauge,
  Languages,
  ShieldCheck,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ROUTES } from '@/shared/config/app';
import { Card } from '@/shared/ui/card';

import { ALL_RULES, DIMENSION_IDS } from '@/entities/analysis';

/** Counted from the registry, so the landing page can never overstate it. */
const RULE_COUNT = ALL_RULES.length;
const DIMENSION_COUNT = DIMENSION_IDS.length;

export function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:py-20">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Резюме, которое дойдёт до человека
        </h1>
        <p className="text-secondary mt-4 text-base leading-relaxed">
          Три четверти резюме отсеиваются автоматикой до того, как их кто-то прочитает. Этот разбор
          показывает, что увидит система отбора, что увидит рекрутер за первые шесть секунд, и что
          именно нужно переписать.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={ROUTES.candidate}
            className="bg-accent-600 hover:bg-accent-700 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-medium text-white transition-colors"
          >
            Проверить резюме
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <span className="text-muted text-[0.8125rem]">
            Без регистрации. Файл не покидает браузер.
          </span>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="sr-only">Что проверяется</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={<Columns2 className="size-5" aria-hidden="true" />}
            title="Читаемость для ATS"
            body="Многоколоночная вёрстка, таблицы, данные в колонтитулах, шрифты и лигатуры — всё, из-за чего парсер получает мешанину вместо резюме."
          />
          <Feature
            icon={<Gauge className="size-5" aria-hidden="true" />}
            title="Достижения вместо обязанностей"
            body="Считает долю пунктов с измеримым результатом, находит «отвечал за» и штампы, предлагает переписанные формулировки."
          />
          <Feature
            icon={<Target className="size-5" aria-hidden="true" />}
            title="Совпадение с вакансией"
            body="Разделяет обязательные требования и желательные, учитывает синонимы: React, ReactJS и React.js — одно и то же."
          />
          <Feature
            icon={<FileSearch className="size-5" aria-hidden="true" />}
            title="Нестандартные резюме"
            body="Если заголовков нет вообще, разделы определяются по содержимому — по датам, спискам и словарю, а не по шаблону."
          />
          <Feature
            icon={<Languages className="size-5" aria-hidden="true" />}
            title="Международный рынок"
            body="Фото, возраст, семейное положение и зарплатные ожидания за рубежом работают против кандидата. Плюс проверка уровня английского."
          />
          <Feature
            icon={<ShieldCheck className="size-5" aria-hidden="true" />}
            title="Приватность по умолчанию"
            body="Разбор и оценка выполняются в браузере. Файл никуда не загружается, а в модель уходит текст с вырезанными персональными данными."
          />
        </div>
      </section>

      <section className="mt-14 border-t border-[var(--border-subtle)] pt-8">
        <dl className="grid gap-6 sm:grid-cols-3">
          <Stat value={String(RULE_COUNT)} label="проверок в движке" />
          <Stat value={String(DIMENSION_COUNT)} label="измерений оценки" />
          <Stat value="0" label="байт уходит на сервер" />
        </dl>
      </section>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="text-accent-600 dark:text-accent-300">{icon}</span>
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      <p className="text-secondary text-[0.8125rem] leading-relaxed">{body}</p>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block text-3xl font-semibold tabular-nums">{value}</span>
        <span className="text-secondary mt-1 block text-[0.8125rem]">{label}</span>
      </dd>
    </div>
  );
}
