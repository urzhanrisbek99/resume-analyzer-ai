import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility audit of every state a person actually sees.
 *
 * A tool that judges resumes for recruiters and candidates is used by people
 * who read it with a screen reader, by keyboard, and at 200% zoom. Checking the
 * empty pages only would prove nothing: the interesting markup -- the score
 * meter, the findings list, the sortable shortlist table -- exists after data
 * is in. So each audit runs against a page that has been driven to a real
 * state.
 *
 * WCAG 2.1 A and AA are checked, in both colour schemes. Contrast is included:
 * the palette is the project's own and nothing excuses getting it wrong.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const RESUME = `Aisha Karimova
Senior Frontend Engineer
aisha.karimova@example.com | +7 700 123 45 67

EXPERIENCE

Senior Frontend Engineer | Kaspi.kz | March 2021 - Present
- Cut Largest Contentful Paint from 4.2s to 1.1s, lifting conversion by 12%
- Led the migration of 240 components to Next.js over 7 months

Frontend Engineer | Chocofamily | June 2018 - February 2021
- Built a design system adopted by 6 teams

SKILLS
TypeScript, React, Next.js, Playwright

EDUCATION
KBTU, 2014 - 2018
`;

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  // The default message is a wall of JSON. Name the rule and the element, which
  // is what a fix starts from.
  const summary = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
        .map((node) => node.target.join(' '))
        .join('\n  ')}`,
  );

  expect(summary, summary.join('\n')).toEqual([]);
}

async function openReport(page: Page) {
  await page.goto('/analyze');
  await page.getByRole('button', { name: /вставить текст резюме/i }).click();
  await page.getByLabel('Текст резюме').fill(RESUME);
  await page.getByRole('button', { name: 'Проанализировать' }).click();
  await expect(page.getByRole('meter', { name: 'из 100' })).toBeVisible({ timeout: 15_000 });
}

async function openShortlist(page: Page) {
  await page.goto('/recruiter');
  await page
    .getByLabel('Загрузить резюме кандидатов')
    .setInputFiles([
      { name: 'karimova.txt', mimeType: 'text/plain', buffer: Buffer.from(RESUME, 'utf-8') },
    ]);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });
}

test.describe('accessibility', () => {
  test('the landing page is clean', async ({ page }) => {
    await page.goto('/');
    await audit(page);
  });

  test('the analyzer is clean before anything is uploaded', async ({ page }) => {
    await page.goto('/analyze');
    await audit(page);
  });

  test('the report is clean, meter and findings included', async ({ page }) => {
    await openReport(page);
    await audit(page);
  });

  test('recruiter mode is clean, shortlist included', async ({ page }) => {
    await openShortlist(page);
    await audit(page);
  });
});

/**
 * The dark palette is a second set of colours and gets a second audit. It is
 * reached through the system preference, which is how most people who use it
 * arrive: the interface has no switch of its own.
 */
test.describe('accessibility in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  /**
   * Without this the audits below would pass by auditing the light palette
   * twice, which is exactly the bug that made the dark tokens unreachable in
   * the first place.
   */
  async function expectDarkPalette(page: Page) {
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const channels = (background.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);

    expect(channels, `body background resolved to ${background}`).toHaveLength(3);
    expect(Math.max(...channels), `body background resolved to ${background}`).toBeLessThan(90);
  }

  test('the report is clean', async ({ page }) => {
    await openReport(page);
    await expectDarkPalette(page);
    await audit(page);
  });

  test('the shortlist is clean', async ({ page }) => {
    await openShortlist(page);
    await expectDarkPalette(page);
    await audit(page);
  });
});
