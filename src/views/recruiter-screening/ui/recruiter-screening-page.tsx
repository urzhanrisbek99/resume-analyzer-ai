import { ShieldCheck } from 'lucide-react';

import { ScreeningWorkspace } from './screening-workspace';

export function RecruiterScreeningPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Скрининг кандидатов</h1>
        <p className="text-secondary mt-2 max-w-2xl text-sm">
          Загрузите резюме нескольких кандидатов и описание вакансии. Список выстроится по
          соответствию требованиям, с покрытием обязательных навыков и тем, что стоит уточнить на
          скрининге.
        </p>

        <p className="text-muted mt-3 inline-flex items-center gap-1.5 text-[0.75rem]">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Резюме кандидатов не покидают ваш компьютер — разбор выполняется в браузере.
        </p>
      </header>

      <ScreeningWorkspace />
    </main>
  );
}
