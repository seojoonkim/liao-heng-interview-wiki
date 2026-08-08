(() => {
  'use strict';

  const VIDEO_URL = 'https://www.bilibili.com/video/BV1nB3u6tERu/';
  const body = document.body;
  const transcript = document.getElementById('transcript');
  const loading = document.getElementById('transcriptLoading');
  const error = document.getElementById('transcriptError');
  const drawer = document.getElementById('tocDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const menuButton = document.getElementById('menuButton');
  const closeButton = document.getElementById('closeDrawer');
  const progressBar = document.getElementById('progressBar');
  const railPercent = document.getElementById('railPercent');
  const backToTop = document.getElementById('backToTop');
  const chapterNumber = document.getElementById('currentChapterNumber');
  const readingStatus = document.getElementById('readingStatus');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastFocus = null;
  let rendered = false;
  let scrollTicking = false;
  let chapterElements = [];
  let markerElements = [];

  const formatTime = value => {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  const openDrawer = () => {
    lastFocus = document.activeElement;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    menuButton.setAttribute('aria-expanded', 'true');
    backdrop.hidden = false;
    body.classList.add('drawer-open');
    const focusCloseButton = () => {
      if (drawer.classList.contains('open')) closeButton.focus({ preventScroll: true });
    };
    focusCloseButton();
    requestAnimationFrame(focusCloseButton);
    window.setTimeout(focusCloseButton, 320);
  };

  const closeDrawer = ({ restoreFocus = true } = {}) => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    menuButton.setAttribute('aria-expanded', 'false');
    backdrop.hidden = true;
    body.classList.remove('drawer-open');
    if (restoreFocus && lastFocus instanceof HTMLElement) lastFocus.focus();
  };

  menuButton.addEventListener('click', openDrawer);
  closeButton.addEventListener('click', () => closeDrawer());
  backdrop.addEventListener('click', () => closeDrawer());
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1000 && drawer.classList.contains('open')) {
      closeDrawer({ restoreFocus: false });
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    if (event.key !== 'Tab' || !drawer.classList.contains('open')) return;
    const focusable = [...drawer.querySelectorAll('a, button, summary')].filter(element => {
      const style = window.getComputedStyle(element);
      const closedDetails = element.closest('details:not([open])');
      return !element.hidden
        && !element.hasAttribute('disabled')
        && (!closedDetails || element === closedDetails.querySelector('summary'))
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && element.getClientRects().length > 0;
    });
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex].focus({ preventScroll: true });
  });

  const headerOffset = () => {
    const header = document.querySelector('.site-header');
    return (header ? header.getBoundingClientRect().height : 64) + 18;
  };

  const resolveHashTarget = hash => {
    if (!hash || hash === '#') return null;
    const id = decodeURIComponent(hash.slice(1));
    if (/^topic-\d+$/.test(id) && rendered) {
      return document.querySelector(`.highlight-marker#${CSS.escape(id)}`);
    }
    return document.getElementById(id);
  };

  const moveToHash = (hash, { updateHistory = false, smooth = true } = {}) => {
    const target = resolveHashTarget(hash);
    if (!target) return false;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerOffset());
    window.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    if (updateHistory && location.hash !== hash) history.pushState(null, '', hash);
    if (target.matches('.highlight-marker, .transcript-chapter, .content-section')) {
      target.setAttribute('tabindex', '-1');
      window.setTimeout(() => target.focus({ preventScroll: true }), smooth && !reduceMotion ? 350 : 0);
    }
    return true;
  };

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    if (!resolveHashTarget(hash)) return;
    event.preventDefault();
    if (drawer.contains(link)) closeDrawer({ restoreFocus: false });
    moveToHash(hash, { updateHistory: true });
  });
  window.addEventListener('popstate', () => moveToHash(location.hash, { smooth: false }));

  const makeTimestamp = (segment, isParagraphStart) => {
    const link = document.createElement('a');
    link.className = `segment-timestamp${isParagraphStart ? ' paragraph-timestamp' : ''}`;
    link.href = `${VIDEO_URL}?t=${Math.floor(segment.start)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = formatTime(segment.start);
    link.setAttribute('aria-label', `${formatTime(segment.start)} 원본 영상에서 보기`);
    return link;
  };

  const makeSegment = (segment, isParagraphStart) => {
    const span = document.createElement('span');
    span.className = `transcript-segment${isParagraphStart ? ' paragraph-start' : ''}`;
    span.id = `segment-${segment.id}`;
    span.dataset.segmentId = String(segment.id);
    span.dataset.start = String(segment.start);
    span.dataset.end = String(segment.end);
    span.append(makeTimestamp(segment, isParagraphStart));
    const text = document.createElement('span');
    text.className = 'segment-text';
    text.textContent = segment.text || '';
    span.append(text);
    return span;
  };

  const makeMarker = highlight => {
    const marker = document.createElement('aside');
    marker.className = 'highlight-marker';
    marker.id = highlight.anchor;
    marker.dataset.topic = String(highlight.id);
    marker.dataset.chapter = String(highlight.chapter);
    marker.dataset.start = String(highlight.start);
    marker.dataset.end = String(highlight.end);
    marker.setAttribute('aria-labelledby', `${highlight.anchor}-title`);

    const index = document.createElement('span');
    index.className = 'highlight-index';
    index.textContent = String(highlight.id).padStart(2, '0');
    const content = document.createElement('div');
    const label = document.createElement('span');
    label.className = 'highlight-label';
    label.textContent = 'IMPORTANT TOPIC';
    const title = document.createElement('h3');
    title.id = `${highlight.anchor}-title`;
    title.textContent = highlight.title;
    const time = document.createElement('a');
    time.className = 'highlight-time';
    time.href = `${VIDEO_URL}?t=${Math.floor(highlight.start)}`;
    time.target = '_blank';
    time.rel = 'noopener noreferrer';
    time.textContent = `${highlight.timestamp || formatTime(highlight.start)} ↗`;
    content.append(label, title, time);
    marker.append(index, content);
    return marker;
  };

  const renderGroup = (segments, container, highlights) => {
    const fragment = document.createDocumentFragment();
    const highlightsBySegment = new Map();
    highlights.forEach(highlight => {
      const target = segments.find(segment => Number(segment.id) >= Number(highlight.segmentStartId))
        || segments.find(segment => Number(segment.start) >= Number(highlight.start));
      if (target) highlightsBySegment.set(Number(target.id), highlight);
    });
    let paragraph = null;
    let paragraphStart = 0;
    let activeHighlight = null;

    segments.forEach((segment, position) => {
      const markerData = highlightsBySegment.get(Number(segment.id));
      const elapsed = paragraph ? Number(segment.end) - paragraphStart : 0;
      const mustBreak = markerData || (paragraph && elapsed >= 32);
      if (!paragraph || mustBreak) {
        if (markerData) {
          const marker = makeMarker(markerData);
          fragment.append(marker);
          activeHighlight = markerData;
        }
        paragraph = document.createElement('p');
        paragraph.className = 'transcript-paragraph';
        paragraph.dataset.start = String(segment.start);
        if (activeHighlight && Number(segment.start) < Number(activeHighlight.end)) {
          paragraph.classList.add('highlighted');
          paragraph.dataset.highlight = String(activeHighlight.id);
        } else {
          activeHighlight = highlights.find(item => Number(segment.start) >= Number(item.start) && Number(segment.start) < Number(item.end)) || null;
          if (activeHighlight) {
            paragraph.classList.add('highlighted');
            paragraph.dataset.highlight = String(activeHighlight.id);
          }
        }
        paragraphStart = Number(segment.start);
        fragment.append(paragraph);
      }
      paragraph.append(makeSegment(segment, paragraph.childElementCount === 0));
      if (position === segments.length - 1) paragraph.dataset.end = String(segment.end);
    });
    container.append(fragment);
  };

  const renderTranscript = data => {
    if (!data || !Array.isArray(data.segments) || !Array.isArray(data.chapters) || !Array.isArray(data.highlights)) {
      throw new Error('Invalid transcript data');
    }
    if (data.segments.length !== 8142 || data.highlights.length !== 35 || data.chapters.length !== 7) {
      throw new Error('Unexpected transcript metadata counts');
    }

    document.querySelectorAll('.transcript-topic-anchor').forEach(anchor => {
      anchor.removeAttribute('id');
      anchor.hidden = true;
    });
    document.querySelectorAll('.transcript-segments').forEach(container => container.replaceChildren());

    const intro = data.segments.filter(segment => Number(segment.start) < Number(data.chapters[0].start));
    renderGroup(intro, document.querySelector('[data-transcript-intro]'), []);

    data.chapters.forEach((chapter, chapterIndex) => {
      const nextStart = data.chapters[chapterIndex + 1]?.start ?? Infinity;
      const chapterSegments = data.segments.filter(segment => Number(segment.start) >= Number(chapter.start) && Number(segment.start) < Number(nextStart));
      const container = document.querySelector(`[data-transcript-chapter="${chapter.id}"]`);
      renderGroup(chapterSegments, container, data.highlights.filter(item => Number(item.chapter) === Number(chapter.id)));
    });

    const segmentCount = document.querySelectorAll('.transcript-segment').length;
    const markerCount = document.querySelectorAll('.highlight-marker').length;
    const populatedChapters = [...document.querySelectorAll('[data-transcript-chapter]')].filter(element => element.children.length > 0).length;
    if (segmentCount !== 8142 || markerCount !== 35 || populatedChapters !== 7) {
      throw new Error(`Render verification failed: ${segmentCount} segments, ${markerCount} markers, ${populatedChapters} chapters`);
    }

    rendered = true;
    chapterElements = [...document.querySelectorAll('.transcript-chapter')];
    markerElements = [...document.querySelectorAll('.highlight-marker')];
    loading.hidden = true;
    error.hidden = true;
    transcript.setAttribute('aria-busy', 'false');
    transcript.dataset.segmentCount = String(segmentCount);
    updateViewportState();
    updateProgress();
    if (location.hash) {
      const settleHash = () => moveToHash(location.hash, { smooth: false });
      requestAnimationFrame(() => requestAnimationFrame(settleHash));
      [120, 500, 1200].forEach(delay => window.setTimeout(settleHash, delay));
    }
  };

  const setActiveLinks = (selector, dataName, value) => {
    document.querySelectorAll(selector).forEach(link => {
      const active = value !== null && link.dataset[dataName] === String(value);
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const updateViewportState = () => {
    scrollTicking = false;
    const probe = headerOffset() + 26;
    let currentChapter = null;
    for (const chapter of chapterElements) {
      if (chapter.getBoundingClientRect().top <= probe) currentChapter = chapter;
      else break;
    }
    if (!currentChapter || transcript.getBoundingClientRect().top > probe) {
      chapterNumber.textContent = '00';
      readingStatus.textContent = 'OVERVIEW';
      setActiveLinks('[data-nav-chapter]', 'navChapter', null);
      setActiveLinks('[data-nav-topic]', 'navTopic', null);
      return;
    }

    const number = currentChapter.dataset.chapter;
    chapterNumber.textContent = `CH ${String(number).padStart(2, '0')}`;
    readingStatus.textContent = currentChapter.querySelector('.chapter-heading h2')?.textContent || '';
    setActiveLinks('[data-nav-chapter]', 'navChapter', number);

    let currentMarker = null;
    for (const marker of markerElements) {
      if (marker.getBoundingClientRect().top <= probe) currentMarker = marker;
      else break;
    }
    const markerInChapter = currentMarker?.dataset.chapter === number ? currentMarker.dataset.topic : null;
    setActiveLinks('[data-nav-topic]', 'navTopic', markerInChapter);
  };

  const updateProgress = () => {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const amount = height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 0;
    progressBar.style.width = `${amount}%`;
    railPercent.textContent = `${Math.round(amount)}%`;
    backToTop.classList.toggle('visible', window.scrollY > window.innerHeight * 0.7);
  };

  const onScroll = () => {
    updateProgress();
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(updateViewportState);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
  updateProgress();

  fetch('transcript.json')
    .then(response => {
      if (!response.ok) throw new Error(`Transcript request failed (${response.status})`);
      return response.json();
    })
    .then(renderTranscript)
    .catch(reason => {
      console.error(reason);
      loading.hidden = true;
      error.hidden = false;
      transcript.setAttribute('aria-busy', 'false');
      transcript.classList.add('load-failed');
    });
})();
