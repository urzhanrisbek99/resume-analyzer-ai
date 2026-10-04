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
    await expect(page.getByText('В достижениях нет цифр')).toBeVisible();

    // And the reason has to be one click away, not buried.
    await page.getByRole('button', { name: /В достижениях нет цифр/ }).click();
    await expect(page.getByText('Почему это важно')).toBeVisible();
    await expect(page.getByText('Что сделать')).toBeVisible();
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
      page.getByText('Персональные данные, которые за рубежом лучше убрать'),
    ).toBeVisible();
  });

  test('starts over without reloading', async ({ page }) => {
    await analysePastedResume(page, WEAK_RESUME);

    await page.getByRole('button', { name: 'Другое резюме' }).click();
    await expect(page.getByRole('button', { name: 'Загрузить резюме' })).toBeVisible();
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
