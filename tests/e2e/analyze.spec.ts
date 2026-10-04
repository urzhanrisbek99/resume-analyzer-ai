import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end coverage of the one path that matters: a resume goes in, a score
 * and actionable findings come out, and selecting a finding points at the text
 * it is talking about.
 *
 * The paste route is used rather than a file upload so the fixture lives in the
 * test rather than as a binary in the repository, and so the assertions do not
 * depend on how a particular PDF was produced.
 */

const WEAK_RESUME = `Ivan Petrov
ivan.petrov@example.com

ОПЫТ РАБОТЫ

Разработчик, ООО Техносервис, 2020 - 2023
- Отвечал за разработку внутренних сервисов компании
- Занимался поддержкой существующего кода
- Участвовал в код-ревью

Программист, ТОО Альфа, 2018 - 2020
- Работал над различными задачами
- Помогал коллегам

НАВЫКИ
Ответственный, стрессоустойчивый, быстро обучаюсь.
JavaScript, React, SQL

ОБРАЗОВАНИЕ
КазНУ, 2014 - 2018

Дата рождения: 15.03.1996
Желаемая зарплата: 800 000 тенге
`;

async function analysePastedResume(page: Page, text: string) {
  await page.goto('/analyze');
  await page.getByRole('button', { name: /вставить текст резюме/i }).click();

  const field = page.getByLabel('Текст резюме');
  await expect(field).toBeVisible();
  await field.fill(text);

  await page.getByRole('button', { name: 'Проанализировать' }).click();
  await expect(page.getByRole('meter', { name: 'из 100' })).toBeVisible({ timeout: 15_000 });
}

test.describe('candidate analysis', () => {
  test('scores a pasted resume and explains the findings', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);

    const score = page.getByRole('meter', { name: 'из 100' });
    const value = Number(await score.getAttribute('aria-valuenow'));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);

    // A resume with no quantified achievements has to be told so.
    await expect(page.getByRole('button', { name: /В достижениях нет цифр/ })).toBeVisible();

    // And the reason has to be one click away, not buried.
    await page.getByRole('button', { name: /В достижениях нет цифр/ }).click();
    await expect(page.getByText('Почему это важно', { exact: true })).toBeVisible();
    await expect(page.getByText('Что сделать', { exact: true })).toBeVisible();
  });

  test('highlights the text a finding refers to', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);

    await page.getByRole('button', { name: /В достижениях нет цифр/ }).click();

    const highlights = page.locator('mark.finding-highlight');
    await expect(highlights.first()).toBeVisible();

    // The highlighted text must actually come from the resume.
    const highlighted = await highlights.first().innerText();
    expect(WEAK_RESUME).toContain(highlighted.trim());
  });

  test('filters findings by dimension', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);

    await page.getByRole('button', { name: /Международный рынок/ }).click();
    await expect(page.getByRole('heading', { name: 'Международный рынок' })).toBeVisible();

    // Date of birth and salary expectations both sit in this dimension.
    await expect(
      page.getByRole('button', { name: /Персональные данные, которые за рубежом лучше убрать/ }),
    ).toBeVisible();
  });

  test('starts over without reloading', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);

    await page.getByRole('button', { name: 'Другое резюме' }).click();
    await expect(page.getByRole('button', { name: 'Загрузить резюме' })).toBeVisible();
  });
});

test.describe('export', () => {
  test('downloads a Markdown report containing every finding', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Markdown' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/.md$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const report = Buffer.concat(chunks).toString('utf-8');

    expect(report).toContain('# Разбор резюме');
    expect(report).toContain('В достижениях нет цифр');
    expect(report).toContain('**Почему это важно.**');
  });

  test('offers a print view holding findings the screen has collapsed', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);

    // Nothing is expanded, yet the printable document carries the detail.
    const printable = page.locator('.print-report');
    await expect(printable).toHaveCount(1);
    await expect(printable).toContainText('Почему это важно', { useInnerText: false });
  });
});

test.describe('AI suggestions', () => {
  /*
   * CI runs without a model key, which is the state this asserts. The
   * deterministic report has to be complete on its own, so the rewrite action
   * is absent rather than present and failing when pressed.
   */
  test('hides the rewrite action when no model is configured', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);
    await page.getByRole('button', { name: /В достижениях нет цифр/ }).click();

    await expect(page.getByText('Почему это важно', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Переписать с помощью модели/ })).toHaveCount(0);
  });

  test('reports availability honestly', async ({ request }) => {
    const response = await request.get('/api/enhance');
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ enabled: false });
  });

  test('refuses a malformed request rather than passing it on', async ({ request }) => {
    const response = await request.post('/api/enhance', {
      data: { ruleId: 'x', guidance: 'y', excerpts: [] },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe('invalid-input');
  });
});

test.describe('landing page', () => {
  test('links through to the analyzer', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('main')
      .getByRole('link', { name: /Проверить резюме/ })
      .click();
    await expect(page).toHaveURL(/\/analyze$/);
    await expect(page.getByRole('heading', { name: 'Проверка резюме' })).toBeVisible();
  });

  test('states the privacy guarantee', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Файл не покидает браузер/)).toBeVisible();
  });
});
