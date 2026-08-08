const { test, expect } = require('@playwright/test');

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 }
];

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('핵심 콘텐츠, 메뉴, 가로 overflow가 정상이다', async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      await page.goto('/', { waitUntil: 'networkidle' });
      await expect(page).toHaveTitle(/랴오헝 인터뷰 LLM Wiki/);
      await expect(page.locator('#page-title')).toBeVisible();
      await expect(page.locator('#summary')).toBeAttached();
      await expect(page.locator('#topic-1')).toBeAttached();
      await expect(page.locator('#topic-35')).toBeAttached();
      await expect(page.locator('.topic')).toHaveCount(35);
      await expect(page.locator('.chapter')).toHaveCount(7);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const topicBody = page.locator('#topic-1 .answer');
      await expect(topicBody).toHaveCSS('font-family', /Pretendard/);
      if (viewport.width === 390) {
        const box = await topicBody.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(360);
      }

      const menu = page.locator('#menuButton');
      if (viewport.width < 1000) {
        await expect(menu).toBeVisible();
        await menu.click();
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#tocDrawer')).toHaveAttribute('aria-hidden', 'false');
        await expect(page.locator('#tocDrawer')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#tocDrawer')).toHaveAttribute('aria-hidden', 'true');
      } else {
        await expect(menu).toBeHidden();
        await expect(page.locator('.desktop-rail')).toBeVisible();
        await expect(page.locator('.desktop-rail [data-nav-chapter]')).toHaveCount(7);
      }

      await page.locator('a[href="#topic-35"]').first().evaluate(element => element.click());
      await expect(page).toHaveURL(/#topic-35$/);
      await expect(page.locator('#topic-35')).toBeInViewport();
      expect(pageErrors).toEqual([]);
    });
  });
}
