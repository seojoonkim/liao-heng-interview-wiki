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

const chapterTopicCounts = [6, 4, 6, 8, 3, 5, 3];
const expectedTopicLabels = chapterTopicCounts.flatMap((count, chapterIndex) =>
  Array.from({ length: count }, (_, topicIndex) => `${chapterIndex + 1}-${topicIndex + 1}`)
);
const expectedTopicIds = Array.from({ length: 35 }, (_, index) => String(index + 1));
const forbiddenLabels = ['IMPORTANT TOPIC', '이 장의 요약', 'INTERVIEW OVERVIEW', 'FULL TRANSCRIPT · 한국어 번역', 'FIELD NOTE', 'NAVIGATION'];

test('히어로 랴오헝 사진은 로컬 공식 출처와 접근성·반응형 geometry 계약을 지킨다', async ({ page }) => {
  const contracts = [
    { viewport: { width: 390, height: 844 }, maxImageHeight: 240 },
    { viewport: { width: 1000, height: 800 }, maxImageHeight: 560 },
    { viewport: { width: 1024, height: 800 }, maxImageHeight: 560 },
    { viewport: { width: 1100, height: 800 }, maxImageHeight: 560 },
    { viewport: { width: 1150, height: 800 }, maxImageHeight: 560 },
    { viewport: { width: 1280, height: 800 }, maxImageHeight: 560 }
  ];

  for (const contract of contracts) {
    await page.setViewportSize(contract.viewport);
    await page.goto('/', { waitUntil: 'networkidle' });
    const figure = page.locator('.hero-portrait');
    const image = figure.locator('img');
    const source = figure.locator('a');

    await expect(figure).toBeVisible();
    await expect(image).toHaveAttribute('src', 'assets/liao-heng-portrait.webp');
    await expect(image).toHaveAttribute('alt', /화웨이 반도체 수석과학자 랴오헝/);
    await expect(image).toHaveAttribute('width', '658');
    await expect(image).toHaveAttribute('height', '370');
    await expect(image).toHaveAttribute('loading', 'eager');
    await expect(image).toHaveAttribute('fetchpriority', 'high');
    await expect(source).toHaveAttribute('href', 'https://www.bilibili.com/video/BV1nB3u6tERu/');
    await expect(figure.locator('.hero-nameplate')).toHaveText('랴오헝');
    await expect(figure.locator('figcaption')).toHaveText('Bilibili 인터뷰 장면 · 랴오헝');
    await expect(page.locator('.hero-deck')).toContainText('화웨이 반도체 수석과학자');
    await expect(page.locator('.hero-deck')).toContainText('어센드 AI 칩 개발');

    const geometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const hero = box('.hero');
      const portrait = box('.hero-portrait');
      const image = document.querySelector('.hero-portrait img');
      const title = box('#page-title');
      const deck = box('.hero-deck');
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        portrait: { top: portrait.top, right: portrait.right, bottom: portrait.bottom, left: portrait.left, width: portrait.width, height: portrait.height },
        image: { width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight },
        insideHero: portrait.left >= hero.left - 1 && portrait.right <= hero.right + 1 && portrait.top >= hero.top - 1 && portrait.bottom <= hero.bottom + 1,
        coversTitle: intersects(portrait, title),
        coversDeck: intersects(portrait, deck),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });

    expect(geometry.image.naturalWidth).toBeGreaterThan(0);
    expect(geometry.image.naturalHeight).toBeGreaterThan(0);
    expect(geometry.portrait.width).toBeGreaterThan(0);
    expect(geometry.portrait.height).toBeGreaterThan(0);
    expect(geometry.portrait.height).toBeLessThanOrEqual(contract.maxImageHeight);
    expect(geometry.insideHero).toBeTruthy();
    expect(geometry.coversTitle).toBeFalsy();
    expect(geometry.coversDeck).toBeFalsy();
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(geometry.image.width / geometry.image.height).toBeCloseTo(geometry.image.naturalWidth / geometry.image.naturalHeight, 2);
  }
});

test('중요 지점은 장-로컬 번호를 쓰되 기존 topic 링크 계약을 보존한다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  const topicContract = await page.evaluate(() => {
    const links = selector => [...document.querySelectorAll(selector)].map(link => ({
      id: link.dataset.navTopic,
      href: link.getAttribute('href'),
      label: link.querySelector(':scope > span')?.textContent.trim()
    }));
    return {
      drawer: links('#tocDrawer [data-nav-topic]'),
      body: links('.transcript-highlights [data-nav-topic]'),
      markerIds: [...document.querySelectorAll('.highlight-marker')].map(marker => marker.id),
      markerTopics: [...document.querySelectorAll('.highlight-marker')].map(marker => marker.dataset.topic),
      markerLabels: [...document.querySelectorAll('.highlight-index')].map(index => index.textContent.trim())
    };
  });
  const expectedLinks = expectedTopicIds.map((id, index) => ({ id, href: `#topic-${id}`, label: expectedTopicLabels[index] }));
  expect(topicContract.drawer).toEqual(expectedLinks);
  expect(topicContract.body).toEqual(expectedLinks);
  expect(topicContract.markerIds).toEqual(expectedTopicIds.map(id => `topic-${id}`));
  expect(topicContract.markerTopics).toEqual(expectedTopicIds);
  expect(topicContract.markerLabels).toEqual(expectedTopicLabels);

  const railLabels = [];
  for (let chapter = 1; chapter <= chapterTopicCounts.length; chapter += 1) {
    await page.evaluate(chapterNumber => {
      const target = document.querySelector(`#chapter-${chapterNumber}`);
      window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - 90);
    }, chapter);
    await expect(page.locator('.desktop-rail [data-rail-topic]')).toHaveCount(chapterTopicCounts[chapter - 1]);
    railLabels.push(...await page.locator('.desktop-rail [data-rail-topic] > span').allTextContents());
  }
  expect(railLabels.map(label => label.trim())).toEqual(expectedTopicLabels);
});

test('반복 라벨은 제거하고 정보성 라벨과 marker 핵심 정보는 유지한다', async ({ page }) => {
  await page.goto('/#topic-35', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  for (const label of forbiddenLabels) await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await expect(page.locator('.highlight-label')).toHaveCount(0);
  await expect(page.getByText(/^CHAPTER 0[1-7]$/)).toHaveCount(7);
  await expect(page.getByText('INDEX / 07', { exact: true })).toHaveCount(1);
  await expect(page.getByText('ARCHIVE 01', { exact: true })).toHaveCount(1);
  await expect(page.getByText('FIELD NOTES', { exact: true })).toHaveCount(2);
  await expect(page.getByText('READ', { exact: true })).toHaveCount(2);
  await expect(page.getByText('ORIGINAL RECORDING', { exact: true })).toHaveCount(1);
  const markerContract = await page.locator('.highlight-marker').evaluateAll(markers => markers.map(marker => ({
    title: marker.querySelector('h3')?.textContent.trim(),
    labelledBy: marker.getAttribute('aria-labelledby'),
    titleId: marker.querySelector('h3')?.id,
    timestamp: marker.querySelector('.highlight-time')?.textContent.trim(),
    timeHref: marker.querySelector('.highlight-time')?.getAttribute('href')
  })));
  expect(markerContract).toHaveLength(35);
  markerContract.forEach((marker, index) => {
    expect(marker.title).not.toBe('');
    expect(marker.labelledBy).toBe(marker.titleId);
    expect(marker.titleId).toBe(`topic-${index + 1}-title`);
    expect(marker.timestamp).toMatch(/^\d{2}:\d{2}:\d{2} ↗$/);
    expect(marker.timeHref).toMatch(/^https:\/\/www\.bilibili\.com\/video\/BV1nB3u6tERu\/\?t=\d+$/);
  });
  await expect(page).toHaveURL(/#topic-35$/);
  await expect.poll(() => page.locator('#topic-35').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(125);
});

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

test('고정 헤더는 작은 사이트 타이틀 위·동적 장 제목 아래의 2줄 구조를 유지한다', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/#chapter-1', { waitUntil: 'networkidle' });
    await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');

    const header = page.locator('.site-header');
    const fixedTitle = header.locator('.header-site-title');
    const chapterTitle = header.locator('#readingStatus');
    await expect(fixedTitle).toHaveCount(1);
    await expect(fixedTitle).toHaveText('랴오헝 인터뷰', { useInnerText: false });
    await expect(chapterTitle).toHaveText(expandedChapterTitles[0]);

    const chapterFour = page.locator('#chapter-4');
    await chapterFour.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 90));
    await expect(chapterTitle).toHaveText(expandedChapterTitles[3]);

    const geometry = await header.evaluate(element => {
      const fixed = element.querySelector('.header-site-title');
      const dynamic = element.querySelector('#readingStatus');
      const fixedBox = fixed.getBoundingClientRect();
      const dynamicBox = dynamic.getBoundingClientRect();
      const headerBox = element.getBoundingClientRect();
      const fixedStyle = getComputedStyle(fixed);
      const dynamicStyle = getComputedStyle(dynamic);
      return {
        domOrder: Boolean(fixed.compareDocumentPosition(dynamic) & Node.DOCUMENT_POSITION_FOLLOWING),
        verticallyOrdered: fixedBox.bottom <= dynamicBox.top + 1,
        insideHeader: fixedBox.top >= headerBox.top && dynamicBox.bottom <= headerBox.bottom + 1,
        fixedSize: parseFloat(fixedStyle.fontSize),
        dynamicSize: parseFloat(dynamicStyle.fontSize),
        dynamicOneLine: dynamicBox.height <= parseFloat(dynamicStyle.lineHeight) + 1,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(geometry.domOrder).toBeTruthy();
    expect(geometry.verticallyOrdered).toBeTruthy();
    expect(geometry.insideHeader).toBeTruthy();
    expect(geometry.fixedSize).toBeGreaterThanOrEqual(10);
    expect(geometry.fixedSize).toBeLessThanOrEqual(12);
    expect(geometry.fixedSize).toBeLessThan(geometry.dynamicSize);
    expect(geometry.dynamicOneLine).toBeTruthy();
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);

    const targetTop = await chapterFour.evaluate(element => element.getBoundingClientRect().top);
    const headerHeight = await header.evaluate(element => element.getBoundingClientRect().height);
    expect(targetTop).toBeGreaterThanOrEqual(headerHeight);

    if (viewport.width === 390) {
      await page.locator('#menuButton').click();
      await expect(page.locator('#tocDrawer')).toBeVisible();
      await expect(page.locator('#menuButton')).toHaveAttribute('aria-expanded', 'true');
      await page.locator('#closeDrawer').click();
    }
  }
});

test('헤더 진행 바는 현재 장의 reading line 기준 진행률·ARIA·geometry를 390px·1280px에서 반영한다', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/#chapter-1', { waitUntil: 'networkidle' });
    await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');

    const progress = page.locator('#chapterProgress');
    const fill = page.locator('#chapterProgressFill');
    await expect(progress).toHaveAttribute('role', 'progressbar');
    await expect(progress).toHaveAttribute('aria-valuemin', '0');
    await expect(progress).toHaveAttribute('aria-valuemax', '100');
    await expect(progress).toHaveAttribute('aria-label', `${expandedChapterTitles[0]} 읽기 진행률`);

    const geometry = await progress.evaluate(element => {
      const box = element.getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const fill = element.querySelector('#chapterProgressFill');
      const style = getComputedStyle(fill);
      return {
        atHeaderBottom: Math.abs(box.bottom - header.bottom) <= 1,
        height: box.height,
        insideViewport: box.left >= 0 && box.right <= document.documentElement.clientWidth,
        origin: style.transformOrigin.split(' ')[0],
        usesTransform: style.transform !== 'none',
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(geometry.atHeaderBottom).toBeTruthy();
    expect(geometry.height).toBeGreaterThanOrEqual(2);
    expect(geometry.height).toBeLessThanOrEqual(3);
    expect(geometry.insideViewport).toBeTruthy();
    expect(geometry.origin).toBe('0px');
    expect(geometry.usesTransform).toBeTruthy();
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);

    const chapterOneValues = [];
    for (const fraction of [0.15, 0.65]) {
      await page.evaluate(fraction => {
        const chapters = [...document.querySelectorAll('.transcript-chapter')];
        const start = window.scrollY + chapters[0].getBoundingClientRect().top;
        const end = window.scrollY + chapters[1].getBoundingClientRect().top;
        const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
        const readingInset = 26;
        window.scrollTo(0, start + (end - start) * fraction - headerBottom - readingInset);
      }, fraction);
      await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(Math.round(fraction * 100) - 1);
      chapterOneValues.push(Number(await progress.getAttribute('aria-valuenow')));
    }
    expect(chapterOneValues[0]).toBeGreaterThanOrEqual(14);
    expect(chapterOneValues[0]).toBeLessThanOrEqual(16);
    expect(chapterOneValues[1]).toBeGreaterThanOrEqual(64);
    expect(chapterOneValues[1]).toBeLessThanOrEqual(66);
    expect(chapterOneValues[1]).toBeGreaterThan(chapterOneValues[0]);

    const chapterFourExpected = await page.evaluate(() => {
      const chapters = [...document.querySelectorAll('.transcript-chapter')];
      const chapter = chapters[3];
      const next = chapters[4];
      const start = window.scrollY + chapter.getBoundingClientRect().top;
      const end = window.scrollY + next.getBoundingClientRect().top;
      const targetFraction = .31;
      const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
      window.scrollTo(0, start + (end - start) * targetFraction - headerBottom - 26);
      return Math.round(targetFraction * 100);
    });
    await expect(page.locator('#readingStatus')).toHaveText(expandedChapterTitles[3]);
    await expect(progress).toHaveAttribute('aria-label', `${expandedChapterTitles[3]} 읽기 진행률`);
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBe(chapterFourExpected);
    await expect.poll(() => fill.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBeCloseTo(chapterFourExpected / 100, 2);
  }
});

test('헤더 진행 바는 감소 모션에서 transition과 animation을 완전히 제거한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#chapter-1', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  const motion = await page.locator('#chapterProgressFill').evaluate(element => {
    const style = getComputedStyle(element);
    return { transitionDuration: style.transitionDuration, animationName: style.animationName };
  });
  expect(motion.transitionDuration).toBe('0s');
  expect(motion.animationName).toBe('none');
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

test('본문 대챕터·중요 지점의 타이포그래피 위계와 행 배치를 보존한다', async ({ page }) => {
  const contracts = [
    { viewport: { width: 390, height: 844 }, chapterTitleSize: 34 },
    { viewport: { width: 1280, height: 800 }, chapterTitleSize: 46 }
  ];

  for (const contract of contracts) {
    await page.setViewportSize(contract.viewport);
    await page.goto('/#chapter-4', { waitUntil: 'networkidle' });
    await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');

    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const content = document.querySelector('.content-column').getBoundingClientRect();
      const markers = [...document.querySelectorAll('.highlight-marker')];
      const insideContent = element => {
        const box = element.getBoundingClientRect();
        return box.left >= content.left - 1 && box.right <= content.right + 1
          && element.scrollWidth <= element.clientWidth + 1
          && element.scrollHeight <= element.clientHeight + 1;
      };
      const markerGeometry = markers.map(marker => {
        const index = marker.querySelector('.highlight-index').getBoundingClientRect();
        const title = marker.querySelector('h3').getBoundingClientRect();
        const timestamp = marker.querySelector('.highlight-time').getBoundingClientRect();
        return {
          indexAboveTitle: index.bottom <= title.top + 1,
          alignedLeft: Math.abs(index.left - title.left) <= 1,
          timestampBelowTitle: timestamp.top >= title.bottom - 1,
          fullyVisible: insideContent(marker.querySelector('h3'))
        };
      });
      return {
        chapterIndexSize: parseFloat(getComputedStyle(document.querySelector('.chapter-index')).fontSize),
        chapterTitleSize: parseFloat(getComputedStyle(document.querySelector('.chapter-heading h2')).fontSize),
        chapterFourFullyVisible: insideContent(document.querySelector('#chapter-4-title')),
        allIndicesAboveTitles: markerGeometry.every(item => item.indexAboveTitle),
        allMarkerLeftsAligned: markerGeometry.every(item => item.alignedLeft),
        allTimestampsBelowTitles: markerGeometry.every(item => item.timestampBelowTitle),
        allMarkerTitlesFullyVisible: markerGeometry.every(item => item.fullyVisible),
        horizontalOverflow: root.scrollWidth - root.clientWidth
      };
    });

    expect.soft(result.chapterIndexSize, `${contract.viewport.width}px chapter index`).toBe(14);
    expect.soft(result.chapterTitleSize, `${contract.viewport.width}px chapter h2`).toBe(contract.chapterTitleSize);
    expect.soft(result.allIndicesAboveTitles).toBeTruthy();
    expect.soft(result.allMarkerLeftsAligned).toBeTruthy();
    expect.soft(result.allTimestampsBelowTitles).toBeTruthy();
    expect.soft(result.chapterFourFullyVisible).toBeTruthy();
    expect.soft(result.allMarkerTitlesFullyVisible).toBeTruthy();
    expect.soft(result.horizontalOverflow).toBeLessThanOrEqual(0);
  }
});

test('본문 타이포그래피와 제목 행간은 390px·1280px에서 가독성과 전체 표시를 보존한다', async ({ page }) => {
  const contracts = [
    {
      viewport: { width: 390, height: 844 },
      sizes: {
        '.hero-deck': 16,
        '.summary-block li': 17,
        '.chapter-summary p': 15.5,
        '.topic p': 16.5,
        '.appendix p': 16.5,
        '.appendix li': 17,
        '.appendix blockquote': 17,
        '.transcript-state': 17,
        '.transcript-disclaimer': 14,
        '.transcript-paragraph': 16.5,
        '.highlight-marker h3': 24
      }
    },
    {
      viewport: { width: 1280, height: 800 },
      sizes: {
        '.hero-deck': 16,
        '.summary-block li': 17,
        '.chapter-summary p': 16,
        '.topic p': 18,
        '.appendix p': 16.5,
        '.appendix li': 17,
        '.appendix blockquote': 17,
        '.transcript-state': 17,
        '.transcript-disclaimer': 14,
        '.transcript-paragraph': 17,
        '.highlight-marker h3': 27
      }
    }
  ];

  for (const contract of contracts) {
    await page.setViewportSize(contract.viewport);
    await page.goto('/#chapter-4', { waitUntil: 'networkidle' });
    await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => {
      const fixtures = [
        ['.topic p', '<section class="topic"><p>주제 본문</p></section>'],
        ['.appendix p', '<section class="appendix"><p>부록 본문</p><ul><li>부록 목록</li></ul><blockquote>부록 인용</blockquote></section>'],
        ['.transcript-state', '<div class="transcript-state">상태 메시지</div>']
      ];
      const container = document.createElement('div');
      container.setAttribute('data-typography-fixtures', '');
      for (const [selector, markup] of fixtures) {
        if (!document.querySelector(selector)) container.insertAdjacentHTML('beforeend', markup);
      }
      if (container.childElementCount) document.querySelector('.transcript-reader').append(container);
    });

    const result = await page.evaluate(expectedSizes => {
      const fontSize = selector => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing typography fixture: ${selector}`);
        return parseFloat(getComputedStyle(element).fontSize);
      };
      const lineHeightRatio = selector => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
      };
      const title = document.querySelector('#chapter-4-title');
      return {
        sizes: Object.fromEntries(Object.keys(expectedSizes).map(selector => [selector, fontSize(selector)])),
        lineHeightRatios: {
          h1: lineHeightRatio('h1'),
          section: lineHeightRatio('.section-heading h2'),
          chapter: lineHeightRatio('.chapter-heading h2')
        },
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        chapterTitleFullyVisible: title.scrollWidth <= title.clientWidth + 1
          && title.scrollHeight <= title.clientHeight + 1
      };
    }, contract.sizes);

    for (const [selector, expectedSize] of Object.entries(contract.sizes)) {
      expect(result.sizes[selector], `${contract.viewport.width}px ${selector}`).toBeCloseTo(expectedSize, 4);
    }
    expect(result.lineHeightRatios.h1).toBeCloseTo(1, 2);
    expect(result.lineHeightRatios.section).toBeCloseTo(1.22, 2);
    expect(result.lineHeightRatios.chapter).toBeCloseTo(1.22, 2);
    expect(result.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(result.chapterTitleFullyVisible).toBeTruthy();
  }
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

test('390px 모바일 목차 번호는 상위 시작선을 맞추고 모든 중요 지점을 20px 들여쓴다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#menuButton').click();
  await page.locator('#tocDrawer details').evaluateAll(details => details.forEach(element => { element.open = true; }));

  const geometry = await page.evaluate(() => {
    const drawer = document.querySelector('#tocDrawer');
    const drawerBox = drawer.getBoundingClientRect();
    const drawerContentLeft = drawerBox.left + parseFloat(getComputedStyle(drawer).paddingLeft);
    const lefts = selector => [...drawer.querySelectorAll(selector)].map(element => element.getBoundingClientRect().left);
    const chapterNumberLefts = [
      drawer.querySelector('nav > a').getBoundingClientRect().left,
      ...lefts('details > summary > span')
    ];
    const topicNumberLefts = lefts('[data-nav-topic] > span');
    const topicLinks = [...drawer.querySelectorAll('[data-nav-topic]')];
    return {
      drawerContentLeft,
      drawerRight: drawerBox.right,
      chapterNumberLefts,
      topicNumberLefts,
      topicLinksInside: topicLinks.every(link => link.getBoundingClientRect().right <= drawerBox.right + 1),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  expect(geometry.chapterNumberLefts).toHaveLength(8);
  geometry.chapterNumberLefts.forEach(left =>
    expect(Math.abs(left - geometry.drawerContentLeft)).toBeLessThanOrEqual(1)
  );
  expect(geometry.topicNumberLefts).toHaveLength(35);
  geometry.topicNumberLefts.forEach(left =>
    expect(Math.abs(left - geometry.drawerContentLeft - 20)).toBeLessThanOrEqual(1)
  );
  expect(geometry.topicLinksInside).toBeTruthy();
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
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

test('전체 요약은 구분선과 장식 아이콘 없이 포멀한 불릿 목록을 사용하고 공식 타임라인을 노출하지 않는다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const summaryList = page.locator('#summary > ul');
  const firstItem = summaryList.locator('li').first();

  await expect(summaryList).toBeVisible();
  await expect(summaryList.locator('li')).toHaveCount(8);
  await expect(page.locator('#timeline')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '공식 타임라인' })).toHaveCount(0);

  const style = await firstItem.evaluate(element => ({
    listStyleType: getComputedStyle(element).listStyleType,
    borderTopStyle: getComputedStyle(element).borderTopStyle,
    beforeContent: getComputedStyle(element, '::before').content
  }));
  expect(style.listStyleType).toBe('disc');
  expect(style.borderTopStyle).toBe('none');
  expect(style.beforeContent).toBe('none');
});

test('Antigravity dark 기반 테마, 배경 층위, 대비와 기존 표시 계약을 지킨다', async ({ page }) => {
  const expectedColors = {
    bg: '#292c33', panel: '#2f3239', panel2: '#36393e', line: '#484a51',
    foreground: '#e7e7e8', brightWhite: '#ffffff', inactive: '#b8bbc1', muted: '#c7c9ce',
    cyan: '#61adab', yellow: '#f5cc41', green: '#63c664', red: '#ef6462'
  };
  const expectedBackgrounds = {
    body: 'rgb(41, 44, 51)', drawer: 'rgb(47, 50, 57)', rail: 'rgb(47, 50, 57)',
    header: 'rgba(47, 50, 57, 0.94)'
  };

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');
    if (viewport.width === 390) await page.locator('#menuButton').click();

    const contract = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const token = name => root.getPropertyValue(name).trim();
      const selectors = ['.brand', '.header-status', '.kicker', '.hero-byline', '.hero-stats dt', '.source-button small', '.play', '.scroll-cue', '.chapter-index', '.paragraph-timestamp', '.highlight-time', '.toc-drawer details a span', '.back-to-top span', 'footer', '.footer-byline'];
      const sizes = selectors.map(selector => ({ selector, size: parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) }));
      const luminance = hex => {
        const channels = hex.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255)
          .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
        return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
      };
      const contrast = (foreground, background) => {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (values[0] + .05) / (values[1] + .05);
      };
      const colors = {
        bg: token('--bg'), panel: token('--panel'), panel2: token('--panel-2'), line: token('--line'),
        foreground: token('--foreground'), brightWhite: token('--bright-white'), inactive: token('--inactive'),
        muted: token('--muted'), cyan: token('--ansi-cyan'), yellow: token('--ansi-yellow'),
        green: token('--ansi-green'), red: token('--ansi-red')
      };
      return {
        colors,
        backgrounds: {
          body: getComputedStyle(document.body).backgroundColor,
          drawer: getComputedStyle(document.querySelector('.toc-drawer')).backgroundColor,
          rail: getComputedStyle(document.querySelector('.desktop-rail')).backgroundColor,
          header: getComputedStyle(document.querySelector('.site-header')).backgroundColor
        },
        layerLuminance: [colors.bg, colors.panel, colors.panel2].map(luminance),
        blueAtLeastRed: [colors.bg, colors.panel, colors.panel2, colors.line].every(hex => parseInt(hex.slice(5, 7), 16) >= parseInt(hex.slice(1, 3), 16)),
        contrast: {
          foregroundBg: contrast(colors.foreground, colors.bg),
          foregroundPanel: contrast(colors.foreground, colors.panel),
          brightWhiteBg: contrast(colors.brightWhite, colors.bg)
        },
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sizes,
        drawerTransition: getComputedStyle(document.querySelector('.toc-drawer')).transitionDuration,
        summaryTransition: getComputedStyle(document.querySelector('.toc-drawer summary')).transitionDuration
      };
    });

    expect(contract.colors).toEqual(expectedColors);
    expect(contract.backgrounds.body).toBe(expectedBackgrounds.body);
    expect(contract.backgrounds.header).toBe(expectedBackgrounds.header);
    if (viewport.width === 390) expect(contract.backgrounds.drawer).toBe(expectedBackgrounds.drawer);
    if (viewport.width === 1280) expect(contract.backgrounds.rail).toBe(expectedBackgrounds.rail);
    expect(contract.blueAtLeastRed).toBeTruthy();
    expect(contract.layerLuminance[0]).toBeLessThan(contract.layerLuminance[1]);
    expect(contract.layerLuminance[1]).toBeLessThan(contract.layerLuminance[2]);
    Object.values(contract.contrast).forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(7));
    expect(contract.horizontalOverflow).toBeLessThanOrEqual(0);
    contract.sizes.forEach(({ selector, size }) => expect(size, selector).toBeGreaterThanOrEqual(11));
    expect(contract.drawerTransition).toMatch(/0\.[12]\d*s/);
    expect(contract.summaryTransition).toMatch(/0\.[12]\d*s/);
  }
});

test('승인 문장만 원문을 보존한 채 노란 글자색으로 정확히 강조한다', async ({ page, request }) => {
  const editorialResponse = await request.get('/key-sentences.json');
  expect(editorialResponse.ok()).toBeTruthy();
  const approved = await editorialResponse.json();
  const transcriptResponse = await request.get('/transcript-ko.json');
  expect(transcriptResponse.ok()).toBeTruthy();
  const transcriptData = await transcriptResponse.json();
  expect(approved).toHaveLength(24);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/#topic-20', { waitUntil: 'networkidle' });
    await expect(page.locator('#transcript')).toHaveAttribute('aria-busy', 'false');

    const result = await page.evaluate(items => {
      const marks = [...document.querySelectorAll('mark.key-sentence')];
      const representativeItems = [items[0], items[Math.floor(items.length / 2)], items.at(-1)];
      return {
        keyParagraphCount: document.querySelectorAll('.key-paragraph').length,
        markCount: marks.length,
        allInsideParagraphText: marks.every(mark => mark.parentElement?.classList.contains('paragraph-text')),
        markTexts: marks.map(mark => mark.textContent),
        styles: marks.map(mark => {
          const style = getComputedStyle(mark);
          return {
            color: style.color,
            backgroundColor: style.backgroundColor,
            padding: style.padding,
            font: style.font,
            parentFont: getComputedStyle(mark.parentElement).font
          };
        }),
        paragraphStyles: representativeItems.map(item => {
          const paragraph = document.querySelector(`#segment-${item.segmentStartId}`)?.closest('.transcript-paragraph');
          const style = getComputedStyle(paragraph);
          return {
            borderLeftWidth: style.borderLeftWidth,
            backgroundImage: style.backgroundImage,
            paddingLeft: style.paddingLeft,
            paddingRight: style.paddingRight
          };
        }),
        paragraphTexts: items.map(item => document.querySelector(`#segment-${item.segmentStartId}`)?.closest('.transcript-paragraph')?.querySelector('.paragraph-text')?.textContent),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, approved);

    const originalParagraphTexts = approved.map(item =>
      transcriptData.paragraphs.find(paragraph => paragraph.segmentStartId === item.segmentStartId)?.text
    );
    expect(result.keyParagraphCount).toBe(0);
    expect(result.markCount).toBe(approved.length);
    expect(result.allInsideParagraphText).toBeTruthy();
    expect(result.markTexts).toEqual(approved.map(item => item.exact_quote));
    result.styles.forEach(style => {
      expect(style.color).toBe('rgb(245, 204, 65)');
      expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(style.padding).toBe('0px');
      expect(style.font).toBe(style.parentFont);
    });
    result.paragraphStyles.forEach(style => {
      expect(style.borderLeftWidth).toBe('0px');
      expect(style.backgroundImage).toBe('none');
      expect(style.paddingLeft).toBe('0px');
      expect(style.paddingRight).toBe('0px');
    });
    expect(result.paragraphTexts).toEqual(originalParagraphTexts);
    expect(result.horizontalOverflow).toBeLessThanOrEqual(0);
  }
});

test('유효하지 않은 핵심 문장 데이터는 하이라이트 없이 fail-closed 처리한다', async ({ page, request }) => {
  const editorialResponse = await request.get('/key-sentences.json');
  expect(editorialResponse.ok()).toBeTruthy();
  const approved = await editorialResponse.json();
  const expectedConsoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') expectedConsoleErrors.push(message.text());
  });

  const invalidCases = [
    {
      name: '존재하지 않는 exact_quote',
      data: [{ ...approved[0], exact_quote: `${approved[0].exact_quote} 존재하지 않는 문장` }],
      error: /Key sentence must match exactly once/
    },
    {
      name: '중복되어 겹치는 exact_quote',
      data: [approved[0], { ...approved[0] }],
      error: /Overlapping key sentences/
    }
  ];

  for (const invalidCase of invalidCases) {
    expectedConsoleErrors.length = 0;
    await page.route('**/key-sentences.json', route => route.fulfill({ json: invalidCase.data }));
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.locator('#transcriptError'), invalidCase.name).toBeVisible();
    const state = await page.locator('#transcript').evaluate(element => ({
      busy: element.getAttribute('aria-busy'),
      errorVisible: !document.querySelector('#transcriptError').hidden
    }));
    expect(state.busy === 'true' || state.errorVisible, invalidCase.name).toBeTruthy();
    await expect(page.locator('mark.key-sentence'), invalidCase.name).toHaveCount(0);
    expect(expectedConsoleErrors.some(message => invalidCase.error.test(message)), invalidCase.name).toBeTruthy();

    await page.unroute('**/key-sentences.json');
  }
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
      await expect(page.locator('.chapter-summary > span')).toHaveCount(0);
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
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 20, 23)');
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
