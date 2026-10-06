import { expect, test, type Page } from '@playwright/test';

/**
 * Recruiter mode, end to end.
 *
 * Files are attached from in-memory buffers rather than from fixtures on disk:
 * the test owns its data, and nothing resembling a real resume ends up in the
 * repository.
 */

const JOB_AD = `Senior Frontend Engineer
Remote (Europe) | Full-time

Requirements
- 5+ years building production web applications
- Expert TypeScript and React
- Experience with Next.js and server-side rendering
- Experience with automated testing (Jest, Playwright)

Nice to have
- GraphQL
- Kubernetes
`;

const MATCHING_CANDIDATE = `Aisha Karimova
Senior Frontend Engineer
aisha.karimova@example.com | +7 700 123 45 67

EXPERIENCE

Senior Frontend Engineer | Kaspi.kz | March 2021 - Present
- Cut Largest Contentful Paint from 4.2s to 1.1s, lifting checkout conversion by 12%
- Led the migration of 240 components to React and Next.js over 7 months
- Introduced Playwright regression testing, cutting UI defects by 71%

Frontend Engineer | Chocofamily | June 2018 - February 2021
- Built a design system adopted by 6 teams, cutting delivery from 3 weeks to 8 days

SKILLS
TypeScript, JavaScript, React, Next.js, Jest, Playwright, GraphQL

LANGUAGES
English - C1
`;

const MISMATCHED_CANDIDATE = `Ivan Petrov
ivan.petrov@example.com

EXPERIENCE

Backend Developer | Local Shop | 2020 - 2023
- Responsible for maintaining PHP services
- Worked on database queries

SKILLS
PHP, MySQL

EDUCATION
State University, 2016 - 2020
`;

async function uploadCandidates(page: Page, files: Array<{ name: string; body: string }>) {
  await page.getByLabel('Загрузить резюме кандидатов').click();
  await page.locator('input[type="file"]').setInputFiles(
    files.map((file) => ({
      name: file.name,
      mimeType: 'text/plain',
      buffer: Buffer.from(file.body, 'utf-8'),
    })),
  );
}

async function setVacancy(page: Page, text: string) {
  await page.getByRole('button', { name: /Сравнить с вакансией/ }).click();
  await page.getByLabel('Текст вакансии').fill(text);
  await page.getByRole('button', { name: /^Сравнить$|^Пересчитать$/ }).click();
}

test.describe('recruiter screening', () => {
  test('ranks a matching candidate above a mismatched one', async ({ page }) => {
    await page.goto('/recruiter');
    await setVacancy(page, JOB_AD);

    await uploadCandidates(page, [
      { name: 'petrov.txt', body: MISMATCHED_CANDIDATE },
      { name: 'karimova.txt', body: MATCHING_CANDIDATE },
    ]);

    await expect(page.getByRole('rowheader', { name: /Karimova/ })).toBeVisible({
      timeout: 20_000,
    });

    const names = await page.getByRole('rowheader').allInnerTexts();
    expect(names[0]).toContain('Aisha Karimova');
    expect(names[1]).toContain('Ivan Petrov');
  });

  test('shows which requirements each candidate is missing', async ({ page }) => {
    await page.goto('/recruiter');
    await setVacancy(page, JOB_AD);
    await uploadCandidates(page, [{ name: 'petrov.txt', body: MISMATCHED_CANDIDATE }]);

    await expect(page.getByRole('rowheader', { name: /Petrov/ })).toBeVisible({ timeout: 20_000 });

    // Scoped to the row header: the remove button also carries the name.
    await page
      .getByRole('rowheader', { name: /Petrov/ })
      .getByRole('button')
      .click();
    await expect(page.getByText('Не найдено в резюме')).toBeVisible();
    const detail = page.getByRole('row').filter({ hasText: 'Не найдено в резюме' });
    await expect(detail.getByText('React', { exact: true })).toBeVisible();
  });

  test('re-ranks without re-reading the files when the vacancy changes', async ({ page }) => {
    await page.goto('/recruiter');
    await uploadCandidates(page, [
      { name: 'karimova.txt', body: MATCHING_CANDIDATE },
      { name: 'petrov.txt', body: MISMATCHED_CANDIDATE },
    ]);

    await expect(page.getByRole('rowheader', { name: /Karimova/ })).toBeVisible({
      timeout: 20_000,
    });

    // No vacancy yet, so the match columns are not offered at all.
    await expect(page.getByRole('columnheader', { name: /Требования/ })).toHaveCount(0);

    await setVacancy(page, JOB_AD);
    await expect(page.getByRole('columnheader', { name: /Требования/ })).toBeVisible();
  });

  test('sorts by a column and announces the direction', async ({ page }) => {
    await page.goto('/recruiter');
    await uploadCandidates(page, [
      { name: 'karimova.txt', body: MATCHING_CANDIDATE },
      { name: 'petrov.txt', body: MISMATCHED_CANDIDATE },
    ]);

    await expect(page.getByRole('rowheader', { name: /Karimova/ })).toBeVisible({
      timeout: 20_000,
    });

    const header = page.getByRole('columnheader', { name: /Кандидат/ });
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');

    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  test('reports files it could not read instead of dropping them', async ({ page }) => {
    await page.goto('/recruiter');
    await uploadCandidates(page, [
      { name: 'karimova.txt', body: MATCHING_CANDIDATE },
      { name: 'empty.txt', body: 'hi' },
    ]);

    await expect(page.getByText('Эти файлы прочитать не удалось')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('empty.txt')).toBeVisible();
  });

  test('removes a candidate from the shortlist', async ({ page }) => {
    await page.goto('/recruiter');
    await uploadCandidates(page, [
      { name: 'karimova.txt', body: MATCHING_CANDIDATE },
      { name: 'petrov.txt', body: MISMATCHED_CANDIDATE },
    ]);

    await expect(page.getByRole('rowheader', { name: /Karimova/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /Убрать Ivan Petrov/ }).click();

    await expect(page.getByRole('rowheader', { name: /Petrov/ })).toHaveCount(0);
    await expect(page.getByRole('rowheader', { name: /Karimova/ })).toBeVisible();
  });
});

test.describe('off-thread parsing', () => {
  test('spawns workers rather than parsing on the main thread', async ({ page }) => {
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));

    await page.goto('/recruiter');
    await uploadCandidates(
      page,
      Array.from({ length: 6 }, (_, i) => ({
        name: `cv-${i}.txt`,
        body: MATCHING_CANDIDATE.replace('Aisha Karimova', `Candidate Number${i}`),
      })),
    );

    await expect(page.getByRole('rowheader')).toHaveCount(6, { timeout: 25_000 });

    // The pool is capped below the file count, so this also proves it is pooled
    // rather than one worker per file.
    expect(workers.length).toBeGreaterThan(0);
    expect(workers.length).toBeLessThanOrEqual(4);
  });

  test('keeps the main thread free while a batch is parsed', async ({ page }) => {
    await page.goto('/recruiter');

    await page.evaluate(() => {
      const scope = window as unknown as { __blockedMs: number };
      scope.__blockedMs = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) scope.__blockedMs += entry.duration;
      }).observe({ entryTypes: ['longtask'] });
    });

    await uploadCandidates(
      page,
      Array.from({ length: 12 }, (_, i) => ({
        name: `cv-${i}.txt`,
        body: MATCHING_CANDIDATE.replace('Aisha Karimova', `Candidate Number${i}`),
      })),
    );

    await expect(page.getByRole('rowheader')).toHaveCount(12, { timeout: 25_000 });

    /*
     * Measured against the same batch running inline: the main thread blocks
     * for 150-290 ms there and for essentially nothing here. The threshold is
     * set well above the observed value so the test reports a regression rather
     * than machine-to-machine variance.
     */
    const blocked = await page.evaluate(
      () => (window as unknown as { __blockedMs: number }).__blockedMs,
    );
    expect(blocked).toBeLessThan(120);
  });

  test('still screens every file when the browser refuses workers', async ({ page }) => {
    // Content-Security-Policy and a handful of embedded browsers do exactly
    // this. A slow result is a result; a lost resume is a bug.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Worker', { value: undefined, configurable: true });
    });

    await page.goto('/recruiter');
    await uploadCandidates(page, [
      { name: 'karimova.txt', body: MATCHING_CANDIDATE },
      { name: 'petrov.txt', body: MISMATCHED_CANDIDATE },
    ]);

    await expect(page.getByRole('rowheader')).toHaveCount(2, { timeout: 25_000 });
    await expect(page.getByRole('rowheader', { name: /Karimova/ })).toBeVisible();
  });
});

test.describe('shortlist export', () => {
  test('downloads a CSV that Excel can read', async ({ page }) => {
    await page.goto('/recruiter');
    await setVacancy(page, JOB_AD);
    await uploadCandidates(page, [
      { name: 'karimova.txt', body: MATCHING_CANDIDATE },
      { name: 'petrov.txt', body: MISMATCHED_CANDIDATE },
    ]);

    await expect(page.getByRole('rowheader', { name: /Karimova/ })).toBeVisible({
      timeout: 20_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Выгрузить CSV' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString('utf-8');

    // The byte-order mark is what stops Excel mangling Cyrillic.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Aisha Karimova');
    expect(csv).toContain('Ivan Petrov');
    expect(csv).toContain('Покрытие требований');
  });
});

test.describe('navigation', () => {
  test('moves between the two modes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Скрининг кандидатов' }).click();
    await expect(page.getByRole('heading', { name: 'Скрининг кандидатов' })).toBeVisible();

    await page.getByRole('navigation').getByRole('link', { name: 'Проверить резюме' }).click();
    await expect(page.getByRole('heading', { name: 'Проверка резюме' })).toBeVisible();
  });
});
