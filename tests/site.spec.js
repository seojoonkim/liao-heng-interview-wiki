const { test, expect } = require('@playwright/test');

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 }
];

const expandedChapterTitles = [
  '칩의 역사: 계산과 연결, 플랫폼 독점의 긴 일몰',
  '무어의 법칙 이후: 공정 선폭 대신 시간·에너지로',
  '18층 보탑: 재료부터 AI 응용까지, 전층 공동설계',
  '화웨이 어센드의 역사: 제재 이후 공급망과 중국의 길',
  '인재와 컴퓨팅 파워: 반복 테이프아웃과 시스템 사고',
  'AI와 칩 기술 최전선: 오픈소스·물리 AI·광 설계',
  '엔지니어 이야기: 열린 협업과 AI 코딩의 가능성'
];

const officialTimelineTitles = [
  '00:02:08 칩의 역사: 독점 아래의 긴 일몰(芯片史：垄断之下漫长的日落)↗',
  '01:17:32 무어의 법칙(摩尔定律)↗',
  '01:31:45 18층 보탑(18层宝塔)↗',
  '01:58:18 화웨이 어센드 역사와 중국의 길(华为昇腾史与中国道路)↗',
  '03:21:29 인재와 컴퓨팅 파워(人才与算力)↗',
  '03:39:23 AI와 칩 기술 최전선(AI与芯片的科技前沿)↗',
  '04:16:45 엔지니어 이야기(工程师故事)↗'
];

test('확장 챕터 제목은 세 탐색 위치에서 일치하고 공식 타임라인 원제는 보존한다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const titles = await page.evaluate(() => {
    const withoutIndex = selector => [...document.querySelectorAll(selector)].map(element => {
      const copy = element.cloneNode(true);
      copy.querySelector(':scope > span')?.remove();
      return copy.textContent.trim();
    });
    return {
      rail: withoutIndex('.desktop-rail [data-nav-chapter]'),
      drawer: withoutIndex('#tocDrawer details > summary'),
      body: [...document.querySelectorAll('.transcript-chapter .chapter-heading h2')].map(element => element.textContent.trim()),
      timeline: [...document.querySelectorAll('#timeline li')].map(element => element.textContent.trim())
    };
  });
  expect(titles.rail).toEqual(expandedChapterTitles);
  expect(titles.drawer).toEqual(expandedChapterTitles);
  expect(titles.body).toEqual(expandedChapterTitles);
  expect(titles.timeline).toEqual(officialTimelineTitles);
});

test('확장 제목은 390px 헤더에서 말줄임되고 목차·본문에서는 전체 줄바꿈된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#chapter-4', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#readingStatus')).toHaveText(expandedChapterTitles[3]);
  const header = await page.locator('#readingStatus').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      textOverflow: style.textOverflow,
      oneLine: element.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 1,
      clipped: element.scrollWidth > element.clientWidth
    };
  });
  expect(header).toEqual({ textOverflow: 'ellipsis', oneLine: true, clipped: true });

  await page.locator('#menuButton').click();
  const drawerSummary = page.locator('#tocDrawer details > summary').nth(3);
  await expect(drawerSummary).toContainText(expandedChapterTitles[3]);
  const drawer = await drawerSummary.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      wrapped: element.getBoundingClientRect().height > parseFloat(style.lineHeight) * 1.5,
      fullyVisible: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1
    };
  });
  expect(drawer).toEqual({ wrapped: true, fullyVisible: true });

  await page.locator('#closeDrawer').click();
  const bodyTitle = page.locator('#chapter-4-title');
  await expect(bodyTitle).toHaveText(expandedChapterTitles[3]);
  const bodyFullyVisible = await bodyTitle.evaluate(element =>
    element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1
  );
  expect(bodyFullyVisible).toBeTruthy();
});

test('1280px desktop rail의 확장 제목은 rail 밖으로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const rail = document.querySelector('.desktop-rail').getBoundingClientRect();
    const links = [...document.querySelectorAll('.desktop-rail [data-nav-chapter]')];
    return {
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      linksInside: links.every(link => {
        const box = link.getBoundingClientRect();
        return box.left >= rail.left && box.right <= rail.right && link.scrollWidth <= link.clientWidth + 1;
      })
    };
  });
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(geometry.linksInside).toBeTruthy();
});

test('모바일 목차는 장→중요 지점 2단계 disclosure만 제공한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#topic-20', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#menuButton').click();
  const drawer = page.locator('#tocDrawer');
  await expect(drawer.locator('details')).toHaveCount(7);
  await expect(drawer.locator('[data-nav-topic]')).toHaveCount(35);
  await expect(drawer.locator('[data-toc-leaf], [data-topic-toggle], [data-topic-leaves]')).toHaveCount(0);
});

test('desktop rail은 현재 장 topic만 제공하고 3단계 selector가 없다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#topic-20', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.desktop-rail [data-rail-topic]')).toHaveCount(8);
  await expect(page.locator('.desktop-rail [data-topic-leaves], .desktop-rail [data-toc-leaf], .desktop-rail [data-topic-toggle]')).toHaveCount(0);
});

test('기존 segment 직접 링크는 대상 전사 문단으로 이동하고 포커스를 둔다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#segment-3818', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  const anchor = page.locator('#segment-3818');
  const paragraph = anchor.locator('xpath=..');
  await expect.poll(() => anchor.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(125);
  await expect(paragraph).toHaveAttribute('tabindex', '-1');
  await expect(paragraph).toBeFocused();
});

test('모바일 chapter summary는 chevron과 aria로 상태를 표시하며 44px 조작 영역을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#topic-20', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#menuButton').click();
  const current = page.locator('#tocDrawer details').nth(3);
  const summary = current.locator('summary');
  await expect(current).toHaveAttribute('open', '');
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  const openState = await summary.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    background: getComputedStyle(element).backgroundColor,
    chevron: getComputedStyle(element, '::after').content,
    transform: getComputedStyle(element, '::after').transform
  }));
  expect(openState.height).toBeGreaterThanOrEqual(44);
  expect(openState.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(openState.chevron).not.toBe('none');
  await summary.click();
  await expect(current).not.toHaveAttribute('open', '');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  const closedTransform = await summary.evaluate(element => getComputedStyle(element, '::after').transform);
  expect(closedTransform).not.toBe(openState.transform);
});

test('warm graphite 테마, 실사용 최소 11px, 절제된 motion 계약을 지킨다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#menuButton').click();
  const contract = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const rgb = name => root.getPropertyValue(name).trim();
    const selectors = ['.brand', '.header-status', '.kicker', '.hero-byline', '.hero-stats dt', '.source-button small', '.play', '.scroll-cue', '.chapter-index', '.chapter-summary span', '.paragraph-timestamp', '.highlight-label', '.highlight-time', '.toc-drawer details a span', '.back-to-top span', 'footer', '.footer-byline'];
    const sizes = selectors.map(selector => ({ selector, size: parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) }));
    const drawerTransition = getComputedStyle(document.querySelector('.toc-drawer')).transitionDuration;
    const summaryTransition = getComputedStyle(document.querySelector('.toc-drawer summary')).transitionDuration;
    const luminance = hex => {
      const channels = hex.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255)
        .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + .05) / (values[1] + .05);
    };
    const inactive = rgb('--inactive');
    return {
      colors: { bg: rgb('--bg'), panel: rgb('--panel'), panel2: rgb('--panel-2'), text: rgb('--foreground'), inactive, muted: rgb('--muted'), cyan: rgb('--ansi-cyan'), yellow: rgb('--ansi-yellow'), green: rgb('--ansi-green') },
      inactiveContrast: [contrast(inactive, rgb('--panel')), contrast(inactive, rgb('--panel-2'))],
      sizes, drawerTransition, summaryTransition
    };
  });
  expect(contract.colors).toEqual({ bg: '#24221f', panel: '#2b2824', panel2: '#34302b', text: '#ddd7cc', inactive: '#9d978e', muted: '#aaa398', cyan: '#72a9a6', yellow: '#c5a45d', green: '#7f9d84' });
  contract.inactiveContrast.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));
  contract.sizes.forEach(({ selector, size }) => expect(size, selector).toBeGreaterThanOrEqual(11));
  expect(contract.drawerTransition).toMatch(/0\.[12]\d*s/);
  expect(contract.summaryTransition).toMatch(/0\.[12]\d*s/);
});

test('전사 타임스탬프는 본문 위의 독립 행이며 제목 위계가 분명하다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.transcript-paragraph')).toHaveCount(634);
  await expect(page.locator('.paragraph-timestamp')).toHaveCount(634);
  await expect(page.locator('.segment-anchor')).toHaveCount(8142);
  await expect(page.locator('.highlight-marker')).toHaveCount(35);
  await expect(page.locator('.transcript-chapter')).toHaveCount(7);
  const contract = await page.locator('.transcript-paragraph').first().evaluate(paragraph => {
    const timestamp = paragraph.querySelector('.paragraph-timestamp');
    const text = paragraph.querySelector('.paragraph-text');
    const timestampBox = timestamp.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    const paragraphBox = paragraph.getBoundingClientRect();
    return {
      timestampBeforeText: Boolean(timestamp.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING),
      rowGap: textBox.top - timestampBox.bottom,
      textWidthRatio: textBox.width / paragraphBox.width,
      timestampDisplay: getComputedStyle(timestamp).display
    };
  });
  expect(contract.timestampBeforeText).toBeTruthy();
  expect(contract.rowGap).toBeGreaterThanOrEqual(4);
  expect(contract.textWidthRatio).toBeGreaterThan(.88);
  expect(['block', 'grid', 'flex']).toContain(contract.timestampDisplay);
  const hierarchy = await page.evaluate(() => {
    const sizeWeight = selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return { size: parseFloat(style.fontSize), weight: Number(style.fontWeight) };
    };
    return { hero: sizeWeight('.hero h1'), section: sizeWeight('.section-heading h2'), chapter: sizeWeight('.chapter-heading h2'), highlight: sizeWeight('.highlight-marker h3'), body: sizeWeight('.transcript-paragraph'), status: sizeWeight('#readingStatus') };
  });
  expect(hierarchy.hero.weight).toBeGreaterThanOrEqual(700);
  expect(hierarchy.section.weight).toBeGreaterThanOrEqual(700);
  expect(hierarchy.chapter.weight).toBeGreaterThanOrEqual(700);
  expect(hierarchy.highlight.weight).toBeGreaterThanOrEqual(700);
  expect(hierarchy.section.size).toBeGreaterThan(hierarchy.body.size * 2);
  expect(hierarchy.chapter.size).toBeGreaterThan(hierarchy.body.size * 1.7);
  expect(hierarchy.highlight.size).toBeGreaterThan(hierarchy.body.size * 1.25);
  expect(hierarchy.status.size).toBeGreaterThanOrEqual(16);
});

test('모바일 목차는 헤더 아래 top sheet이며 현재 장과 topic을 동기화한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#topic-20', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#menuButton').click();
  const drawer = page.locator('#tocDrawer');
  await expect(drawer.locator('[data-nav-topic]')).toHaveCount(35);
  await expect(drawer.locator('details').nth(3)).toHaveAttribute('open', '');
  await expect(drawer.locator('[data-nav-topic="20"]')).toHaveAttribute('aria-current', 'location');
  const geometry = await page.evaluate(() => {
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const sheet = document.querySelector('#tocDrawer').getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('#tocDrawer'));
    return { headerBottom: header.bottom, top: sheet.top, left: sheet.left, rightGap: innerWidth - sheet.right, width: sheet.width, maxHeight: parseFloat(style.maxHeight), overflowY: style.overflowY, transform: style.transform };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
  expect(geometry.left).toBeLessThanOrEqual(1);
  expect(geometry.rightGap).toBeLessThanOrEqual(1);
  expect(geometry.width).toBeLessThanOrEqual(390);
  expect(geometry.maxHeight).toBeLessThanOrEqual(844 - geometry.headerBottom + 1);
  expect(['auto', 'scroll']).toContain(geometry.overflowY);
  expect(geometry.transform).toBe('none');
  await expect(drawer).toHaveAttribute('role', 'dialog');
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  const backdropTop = await page.locator('#drawerBackdrop').evaluate(element => element.getBoundingClientRect().top);
  expect(backdropTop).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await expect(page.locator('.site-header')).toHaveAttribute('inert', '');

  await page.locator('#closeDrawer').click();
  await page.evaluate(() => {
    const target = document.querySelector('#topic-28');
    window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - 90);
  });
  await expect(page.locator('#currentChapterNumber')).toHaveText('CH 06');
  await page.locator('#menuButton').click();
  await expect(drawer.locator('details').nth(5)).toHaveAttribute('open', '');
  await expect(drawer.locator('[data-nav-topic="28"]')).toHaveAttribute('aria-current', 'location');
});

test('초기 hash 이후 첫 메뉴도 사용자 스크롤의 현재 topic을 우선한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#topic-20', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const target = document.querySelector('#topic-28');
    window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - 90);
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
  });
  await expect(page.locator('#currentChapterNumber')).toHaveText('CH 06');
  await page.locator('#menuButton').click();
  const drawer = page.locator('#tocDrawer');
  await expect(drawer.locator('details').nth(5)).toHaveAttribute('open', '');
  await expect(drawer.locator('[data-nav-topic="28"]')).toHaveAttribute('aria-current', 'location');
});

test('desktop rail은 현재 장의 topic만 조밀하지 않게 제공하고 직접 이동한다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#topic-20', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  const topics = page.locator('.desktop-rail [data-rail-topic]');
  await expect(topics).toHaveCount(8);
  await expect(page.locator('.desktop-rail [data-rail-topic="20"]')).toHaveAttribute('aria-current', 'location');
  await page.locator('.desktop-rail [data-rail-topic="23"]').click();
  await expect(page).toHaveURL(/#topic-23$/);
  await expect.poll(() => page.locator('#topic-23').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(125);
});

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
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(36, 34, 31)');
      await expect(page.locator('.brand b')).toHaveCSS('color', 'rgb(114, 169, 166)');
      await expect(page.locator('.chapter-index').first()).toHaveCSS('color', 'rgb(197, 164, 93)');
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
      await expect(page.locator('#readingStatus')).toHaveText(expandedChapterTitles[5]);
      expect(pageErrors).toEqual([]);
    });

    test('중요 지점 직접 링크가 렌더 후 고정 헤더 아래로 이동한다', async ({ page }) => {
      await page.goto('/#topic-35', { waitUntil: 'networkidle' });
      await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
      const topicTop = async () => page.locator('#topic-35').evaluate(element => element.getBoundingClientRect().top);
      await expect.poll(topicTop, { timeout: 5000 }).toBeGreaterThanOrEqual(70);
      await expect.poll(topicTop, { timeout: 5000 }).toBeLessThan(125);
      await expect(page.locator('#currentChapterNumber')).toHaveText('CH 07');
      await expect(page.locator('#readingStatus')).toHaveText(expandedChapterTitles[6]);
    });
  });
}
