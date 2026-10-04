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

test.describe('navigation', () => {
  test('moves between the two modes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: 'Скрининг кандидатов' }).click();
    await expect(page.getByRole('heading', { name: 'Скрининг кандидатов' })).toBeVisible();

    await page.getByRole('navigation').getByRole('link', { name: 'Проверить резюме' }).click();
    await expect(page.getByRole('heading', { name: 'Проверка резюме' })).toBeVisible();
  });
});
