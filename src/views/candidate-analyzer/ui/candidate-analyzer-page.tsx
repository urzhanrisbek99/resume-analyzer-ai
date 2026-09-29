import { ShieldCheck } from 'lucide-react';

import { AnalyzerWorkspace } from './analyzer-workspace';

/**
 * The candidate route.
 *
 * A view assembles widgets and sets the page frame. It holds no state and no
 * logic, which keeps routes cheap to add and impossible to accidentally turn
 * into a second home for business rules.
 */
export function CandidateAnalyzerPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Проверка резюме</h1>
        <p className="text-secondary mt-2 max-w-2xl text-sm">
          Загрузите резюме и получите разбор по семи измерениям: пройдёт ли оно автоматический
          отбор, что увидит рекрутер за первые шесть секунд и что именно переписать.
        </p>

        <p className="text-muted mt-3 inline-flex items-center gap-1.5 text-[0.75rem]">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Файл не покидает ваш компьютер: разбор и оценка выполняются в браузере.
        </p>
      </header>

      <AnalyzerWorkspace />
    </main>
  );
}
