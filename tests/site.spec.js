const { test, expect } = require('@playwright/test');

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 }
];

test('모바일 drawer의 focus trap과 desktop resize 복원이 정상이다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  const menu = page.locator('#menuButton');
  const drawer = page.locator('#tocDrawer');
  const close = page.locator('#closeDrawer');
  await menu.click();
  await expect(close).toBeFocused({ timeout: 1000 });
  await page.waitForTimeout(350);
  await expect(close).toBeFocused();

  const lastVisible = await drawer.locator('a, button, summary').evaluateAll(elements => {
    const visible = elements.filter(element => {
      const style = getComputedStyle(element);
      const closedDetails = element.closest('details:not([open])');
      return !element.hidden && (!closedDetails || element === closedDetails.querySelector('summary'))
        && style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
    const target = visible.at(-1);
    return target.id || target.textContent.trim();
  });
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim())).toBe(lastVisible);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#drawerBackdrop')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
});

test('모든 transcript segment의 구조와 순서가 유효하다', async ({ request }) => {
  const response = await request.get('/transcript-ko.json');
  expect(response.ok()).toBeTruthy();
  const sourceResponse = await request.get('/transcript.json');
  expect(sourceResponse.ok()).toBeTruthy();
  const { language, sourceLanguage, segments, paragraphs, highlights } = await response.json();
  const { segments: sourceSegments } = await sourceResponse.json();
  expect(language).toBe('ko');
  expect(sourceLanguage).toBe('zh');
  expect(segments).toHaveLength(8142);
  expect(sourceSegments).toHaveLength(8142);
  expect(Array.isArray(paragraphs)).toBeTruthy();
  expect(paragraphs.length).toBeGreaterThan(100);
  expect(paragraphs.length).toBeLessThan(segments.length);
  expect(paragraphs[0].segmentStartId).toBe(0);
  expect(paragraphs.at(-1).segmentEndId).toBe(8141);
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    expect(Object.keys(paragraph).sort()).toEqual([
      'end', 'id', 'segmentEndId', 'segmentStartId', 'start', 'text'
    ]);
    expect(paragraph.id).toBe(index);
    expect(paragraph.segmentEndId).toBeGreaterThanOrEqual(paragraph.segmentStartId);
    if (index > 0) expect(paragraph.segmentStartId).toBe(paragraphs[index - 1].segmentEndId + 1);
    if (paragraph.text.trim()) expect(paragraph.text.trim()).toMatch(/[.!?…]["'”’）)\]]*$/);
  }
  for (const highlight of highlights) {
    expect(paragraphs.some(paragraph =>
      paragraph.segmentStartId <= highlight.segmentStartId && highlight.segmentStartId <= paragraph.segmentEndId
    )).toBeTruthy();
  }
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    expect(Object.keys(segment).sort()).toEqual(['end', 'id', 'start', 'text']);
    expect(segment.id).toBe(index);
    expect(typeof segment.text).toBe('string');
    if (sourceSegments[index].text.trim()) expect(segment.text.trim()).not.toBe('');
    if (segment.text.trim() && !/^[\d\s.,!?]+$/.test(segment.text)) {
      expect(segment.text).toMatch(/[가-힣]/);
    }
    expect(Number.isFinite(segment.start)).toBeTruthy();
    expect(Number.isFinite(segment.end)).toBeTruthy();
    expect(segment.end).toBeGreaterThanOrEqual(segment.start);
  }
  const startRegressions = segments.slice(0, -1)
    .filter((segment, index) => segment.start > segments[index + 1].start)
    .map(segment => segment.id);
  expect(startRegressions).toEqual([1968, 6726]);
  expect(segments[1968].end).toBe(segments[1968].start);
  expect(segments[6726].end).toBe(segments[6726].start);
});

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('전체 전사, 하이라이트, 고정 헤더와 메뉴가 정상이다', async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      await page.goto('/', { waitUntil: 'networkidle' });
      await expect(page).toHaveTitle('랴오헝 인터뷰 — 반도체 연구자의 필드 노트');
      await expect(page.locator('#page-title')).toBeVisible();
      await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('.segment-anchor')).toHaveCount(8142);
      const paragraphCount = await page.locator('.transcript-paragraph').count();
      expect(paragraphCount).toBe(634);
      await expect(page.locator('.segment-timestamp')).toHaveCount(paragraphCount);
      await expect(page.locator('.highlight-marker')).toHaveCount(35);
      await expect(page.locator('.transcript-chapter')).toHaveCount(7);
      await expect(page.locator('.transcript-paragraph .paragraph-text').first()).not.toHaveText('');
      await expect(page.locator('#segment-8141')).toBeAttached();
      await expect(page.locator('#topic-1')).toContainText('계산과 연결');
      await expect(page.locator('#topic-35')).toContainText('AI 코딩');
      await expect(page.locator('.transcript-paragraph.highlighted').first()).toBeVisible();
      await expect(page.locator('.transcript-paragraph').first()).toHaveCSS('font-family', /Pretendard/);
      await expect(page.locator('.hero-byline')).toHaveText('Curated & built by Simon Kim · Hashed');
      await expect(page.locator('.footer-byline')).toHaveText('A project by Simon Kim at Hashed');
      await expect(page.locator('#summary-title')).toHaveText('전체 요약');
      await expect(page.locator('.chapter-summary')).toHaveCount(7);
      await expect(page.locator('.chapter-summary > span')).toHaveText(Array(7).fill('이 장의 요약'));
      await expect(page.locator('#chapter-4 .chapter-summary p')).toContainText('어센드 910에서 950');
      const editorialGeometry = await page.evaluate(() => {
        const heading = document.querySelector('#chapter-4 .chapter-heading');
        const title = heading.querySelector('h2');
        const divider = heading.querySelector('.chapter-line');
        const paragraph = document.querySelector('.transcript-paragraph');
        const index = document.querySelector('.transcript-highlights');
        const marker = document.querySelector('.highlight-marker');
        const titleStyle = getComputedStyle(title);
        const paragraphStyle = getComputedStyle(paragraph);
        const indexStyle = getComputedStyle(index);
        const markerStyle = getComputedStyle(marker);
        return {
          headingHeight: heading.getBoundingClientRect().height,
          titleSize: parseFloat(titleStyle.fontSize),
          bodySize: parseFloat(paragraphStyle.fontSize),
          bodyLineHeight: parseFloat(paragraphStyle.lineHeight),
          dividerWidth: divider.getBoundingClientRect().width,
          headingWidth: heading.getBoundingClientRect().width,
          paragraphBorderTop: paragraphStyle.borderTopWidth,
          indexBackground: indexStyle.backgroundColor,
          indexBorder: indexStyle.borderTopWidth,
          markerBackground: markerStyle.backgroundColor,
          markerShadow: markerStyle.boxShadow
        };
      });
      expect(editorialGeometry.headingHeight).toBeLessThan(180);
      expect(editorialGeometry.titleSize).toBeGreaterThan(editorialGeometry.bodySize * 1.5);
      expect(editorialGeometry.bodyLineHeight).toBeGreaterThan(editorialGeometry.bodySize * 1.75);
      expect(editorialGeometry.dividerWidth).toBeGreaterThan(editorialGeometry.headingWidth * .9);
      expect(editorialGeometry.paragraphBorderTop).toBe('0px');
      expect(editorialGeometry.indexBackground).toBe('rgba(0, 0, 0, 0)');
      expect(editorialGeometry.indexBorder).toBe('0px');
      expect(editorialGeometry.markerBackground).toBe('rgba(0, 0, 0, 0)');
      expect(editorialGeometry.markerShadow).toBe('none');
      const badParagraphEndings = await page.locator('.paragraph-text').evaluateAll(elements =>
        elements.filter(element => element.textContent.trim() && !/[.!?…]["'”’）)\]]*$/.test(element.textContent.trim())).length
      );
      expect(badParagraphEndings).toBe(0);
      await expect(page.locator('.site-header')).toHaveCSS('position', 'fixed');
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(31, 31, 31)');
      await expect(page.locator('.brand b')).toHaveCSS('color', 'rgb(17, 168, 205)');
      await expect(page.locator('.chapter-index').first()).toHaveCSS('color', 'rgb(229, 229, 16)');
      const headerTitleSize = await page.locator('#readingStatus').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      expect(headerTitleSize).toBeGreaterThanOrEqual(viewport.width < 1000 ? 14 : 15);
      const timestampSize = await page.locator('.paragraph-timestamp').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      expect(timestampSize).toBeGreaterThanOrEqual(10);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const menu = page.locator('#menuButton');
      if (viewport.width < 1000) {
        await expect(menu).toBeVisible();
        await expect(page.locator('.header-status')).toBeVisible();
        await menu.click();
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#tocDrawer')).toBeVisible();
        await page.locator('#tocDrawer details').nth(5).locator('summary').click();
        const topicLink = page.locator('#tocDrawer a[href="#topic-28"]');
        await expect(topicLink).toBeVisible();
        await topicLink.click();
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await expect(page).toHaveURL(/#topic-28$/);
        await expect.poll(async () => page.locator('#topic-28').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(125);
      } else {
        await expect(menu).toBeHidden();
        await expect(page.locator('.desktop-rail')).toBeVisible();
        await expect(page.locator('.desktop-rail [data-nav-chapter]')).toHaveCount(7);
        await page.locator('.desktop-rail a[href="#chapter-6"]').click();
        await expect(page).toHaveURL(/#chapter-6$/);
        await expect(page.locator('#chapter-6')).toBeInViewport();
      }

      await expect(page.locator('#currentChapterNumber')).toHaveText('CH 06');
      await expect(page.locator('#readingStatus')).toHaveText('AI와 칩 기술 최전선');
      expect(pageErrors).toEqual([]);
    });

    test('중요 지점 직접 링크가 렌더 후 고정 헤더 아래로 이동한다', async ({ page }) => {
      await page.goto('/#topic-35', { waitUntil: 'networkidle' });
      await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
      const topicTop = async () => page.locator('#topic-35').evaluate(element => element.getBoundingClientRect().top);
      await expect.poll(topicTop, { timeout: 5000 }).toBeGreaterThanOrEqual(70);
      await expect.poll(topicTop, { timeout: 5000 }).toBeLessThan(125);
      await expect(page.locator('#currentChapterNumber')).toHaveText('CH 07');
      await expect(page.locator('#readingStatus')).toHaveText('엔지니어 이야기');
    });
  });
}
