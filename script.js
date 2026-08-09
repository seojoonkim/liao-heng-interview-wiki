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
  const chapterProgress = document.getElementById('chapterProgress');
  const chapterProgressFill = document.getElementById('chapterProgressFill');
  const railTopics = document.getElementById('railTopics');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const modalSiblings = [...body.children].filter(element => element !== drawer && element !== backdrop);
  let lastFocus = null;
  let rendered = false;
  let scrollTicking = false;
  let chapterElements = [];
  let markerElements = [];
  let currentRailChapter = null;
  let activeChapter = null;
  let activeTopic = null;
  let progressChapter = null;
  let initialHashPending = Boolean(location.hash);
  const drawerDetails = [...drawer.querySelectorAll('details')];
  const topicNumber = (chapter, index) => `${chapter}-${index + 1}`;
  drawerDetails.forEach((details, chapterIndex) => {
    details.querySelectorAll('[data-nav-topic] > span').forEach((label, topicIndex) => {
      label.textContent = topicNumber(chapterIndex + 1, topicIndex);
    });
  });
  document.querySelectorAll('.transcript-chapter').forEach(chapter => {
    chapter.querySelectorAll('.transcript-highlights [data-nav-topic] > span').forEach((label, topicIndex) => {
      label.textContent = topicNumber(chapter.dataset.chapter, topicIndex);
    });
  });
  const syncDisclosureAria = details => details.querySelector('summary')?.setAttribute('aria-expanded', String(details.open));
  drawerDetails.forEach(details => {
    syncDisclosureAria(details);
    details.addEventListener('toggle', () => syncDisclosureAria(details));
  });

  const syncDrawerChapter = chapter => {
    drawerDetails.forEach((item, index) => {
      item.open = chapter !== null && index + 1 === Number(chapter);
      syncDisclosureAria(item);
    });
  };

  const renderRailTopics = chapter => {
    if (!railTopics || currentRailChapter === String(chapter)) return;
    currentRailChapter = String(chapter);
    railTopics.replaceChildren();
    if (chapter === null) return;
    const source = document.querySelector(`#chapter-${CSS.escape(String(chapter))} .transcript-highlights`);
    source?.querySelectorAll('a[data-nav-topic]').forEach(sourceLink => {
      const link = sourceLink.cloneNode(true);
      link.dataset.railTopic = link.dataset.navTopic;
      delete link.dataset.navTopic;
      railTopics.append(link);
    });
  };

  const formatTime = value => {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  const openDrawer = () => {
    lastFocus = document.activeElement;
    updateViewportState();
    const hashTarget = location.hash ? resolveHashTarget(location.hash) : null;
    const fallbackChapter = hashTarget?.dataset.chapter || hashTarget?.closest('.transcript-chapter')?.dataset.chapter || null;
    const drawerChapter = initialHashPending ? fallbackChapter || activeChapter : activeChapter;
    const drawerTopic = initialHashPending ? hashTarget?.dataset.topic || activeTopic : activeTopic;
    initialHashPending = false;
    syncDrawerChapter(drawerChapter);
    setActiveLinks('[data-nav-topic]', 'navTopic', drawerTopic);

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    menuButton.setAttribute('aria-expanded', 'true');
    const revealActiveTopic = () => {
      const activeLink = drawer.querySelector(`[data-nav-topic="${CSS.escape(String(drawerTopic))}"]`);
      if (!activeLink || !drawer.classList.contains('open')) return;
      const drawerBox = drawer.getBoundingClientRect();
      const linkBox = activeLink.getBoundingClientRect();
      drawer.scrollTop += linkBox.top - drawerBox.top - Math.max(88, drawer.clientHeight * .34);
    };
    requestAnimationFrame(revealActiveTopic);
    window.setTimeout(revealActiveTopic, reduceMotion ? 0 : 280);
    backdrop.hidden = false;
    body.classList.add('drawer-open');
    modalSiblings.forEach(element => element.setAttribute('inert', ''));
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
    modalSiblings.forEach(element => element.removeAttribute('inert'));
    if (restoreFocus && lastFocus instanceof HTMLElement) lastFocus.focus();
  };

  const cancelInitialHashSettlement = () => { initialHashPending = false; };
  ['wheel', 'touchmove'].forEach(type => window.addEventListener(type, cancelInitialHashSettlement, { passive: true, once: true }));
  window.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancelInitialHashSettlement();
  });

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
    const focusTarget = target.matches('.segment-anchor') ? target.closest('.transcript-paragraph') : target;
    if (focusTarget?.matches('.highlight-marker, .transcript-chapter, .content-section, .transcript-paragraph')) {
      focusTarget.setAttribute('tabindex', '-1');
      window.setTimeout(() => focusTarget.focus({ preventScroll: true }), smooth && !reduceMotion ? 350 : 0);
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

  const makeTimestamp = paragraph => {
    const link = document.createElement('a');
    link.className = 'segment-timestamp paragraph-timestamp';
    link.href = `${VIDEO_URL}?t=${Math.floor(paragraph.start)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = formatTime(paragraph.start);
    link.setAttribute('aria-label', `${formatTime(paragraph.start)} 원본 영상에서 보기`);
    return link;
  };

  const makeSegmentAnchor = segment => {
    const span = document.createElement('span');
    span.className = 'segment-anchor';
    span.id = `segment-${segment.id}`;
    span.dataset.segmentId = String(segment.id);
    span.dataset.start = String(segment.start);
    span.dataset.end = String(segment.end);
    return span;
  };

  const makeMarker = (highlight, topicIndex) => {
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
    index.textContent = topicNumber(highlight.chapter, topicIndex);
    const content = document.createElement('div');
    const title = document.createElement('h3');
    title.id = `${highlight.anchor}-title`;
    title.textContent = highlight.title;
    const time = document.createElement('a');
    time.className = 'highlight-time';
    time.href = `${VIDEO_URL}?t=${Math.floor(highlight.start)}`;
    time.target = '_blank';
    time.rel = 'noopener noreferrer';
    time.textContent = `${highlight.timestamp || formatTime(highlight.start)} ↗`;
    content.append(title, time);
    marker.append(index, content);
    return marker;
  };

  const appendParagraphText = (container, paragraphData, keySentences) => {
    const matches = keySentences.get(Number(paragraphData.segmentStartId)) || [];
    let cursor = 0;
    matches.forEach(({ exact_quote: quote, start }) => {
      container.append(document.createTextNode(paragraphData.text.slice(cursor, start)));
      const mark = document.createElement('mark');
      mark.className = 'key-sentence';
      mark.textContent = quote;
      container.append(mark);
      cursor = start + quote.length;
    });
    container.append(document.createTextNode(paragraphData.text.slice(cursor)));
  };

  const renderGroup = (paragraphs, segmentsById, container, highlights, keySentences) => {
    const fragment = document.createDocumentFragment();
    const highlightsBySegment = new Map();
    highlights.forEach(highlight => {
      const containingParagraph = paragraphs.find(paragraph =>
        Number(paragraph.segmentStartId) <= Number(highlight.segmentStartId)
        && Number(highlight.segmentStartId) <= Number(paragraph.segmentEndId)
      );
      if (containingParagraph) highlightsBySegment.set(Number(containingParagraph.segmentStartId), highlight);
    });
    let activeHighlight = null;

    paragraphs.forEach(paragraphData => {
      const markerData = highlightsBySegment.get(Number(paragraphData.segmentStartId));
      if (markerData) {
        fragment.append(makeMarker(markerData, highlights.indexOf(markerData)));
        activeHighlight = markerData;
      }
      const paragraph = document.createElement('p');
      paragraph.className = 'transcript-paragraph';
      paragraph.dataset.start = String(paragraphData.start);
      paragraph.dataset.end = String(paragraphData.end);
      if (!activeHighlight || Number(paragraphData.start) >= Number(activeHighlight.end)) {
        activeHighlight = highlights.find(item => Number(paragraphData.start) >= Number(item.start) && Number(paragraphData.start) < Number(item.end)) || null;
      }
      if (activeHighlight) {
        paragraph.classList.add('highlighted');
        paragraph.dataset.highlight = String(activeHighlight.id);
      }
      paragraph.append(makeTimestamp(paragraphData));
      for (let id = paragraphData.segmentStartId; id <= paragraphData.segmentEndId; id += 1) {
        const segment = segmentsById.get(Number(id));
        if (!segment) throw new Error(`Missing segment ${id}`);
        paragraph.append(makeSegmentAnchor(segment));
      }
      const text = document.createElement('span');
      text.className = 'paragraph-text';
      appendParagraphText(text, paragraphData, keySentences);
      paragraph.append(text);
      fragment.append(paragraph);
    });
    container.append(fragment);
  };

  const renderTranscript = (data, editorialData) => {
    if (!data || !Array.isArray(data.segments) || !Array.isArray(data.paragraphs) || !Array.isArray(data.chapters) || !Array.isArray(data.highlights)) {
      throw new Error('Invalid transcript data');
    }
    if (data.segments.length !== 8142 || data.paragraphs.length <= 100 || data.highlights.length !== 35 || data.chapters.length !== 7) {
      throw new Error('Unexpected transcript metadata counts');
    }
    if (!Array.isArray(editorialData)) throw new Error('Invalid key sentence data');

    const keySentences = new Map();
    editorialData.forEach((item, index) => {
      if (!Number.isInteger(item.segmentStartId) || typeof item.exact_quote !== 'string' || !item.exact_quote) {
        throw new Error(`Invalid key sentence item ${index}`);
      }
      const paragraph = data.paragraphs.find(candidate => Number(candidate.segmentStartId) === item.segmentStartId);
      if (!paragraph) throw new Error(`Key sentence paragraph not found: ${item.segmentStartId}`);
      const first = paragraph.text.indexOf(item.exact_quote);
      const occurrences = first < 0 ? 0 : paragraph.text.split(item.exact_quote).length - 1;
      if (occurrences !== 1) throw new Error(`Key sentence must match exactly once: ${item.segmentStartId} (${occurrences})`);
      const matches = keySentences.get(item.segmentStartId) || [];
      const end = first + item.exact_quote.length;
      if (matches.some(match => first < match.end && end > match.start)) {
        throw new Error(`Overlapping key sentences: ${item.segmentStartId}`);
      }
      matches.push({ ...item, start: first, end });
      matches.sort((a, b) => a.start - b.start);
      keySentences.set(item.segmentStartId, matches);
    });

    document.querySelectorAll('.transcript-topic-anchor').forEach(anchor => {
      anchor.removeAttribute('id');
      anchor.hidden = true;
    });
    document.querySelectorAll('.transcript-segments').forEach(container => container.replaceChildren());

    const segmentsById = new Map(data.segments.map(segment => [Number(segment.id), segment]));

    const firstChapterSegment = Number(data.chapters[0].segmentStartId);
    const intro = data.paragraphs.filter(paragraph => Number(paragraph.segmentStartId) < firstChapterSegment);
    renderGroup(intro, segmentsById, document.querySelector('[data-transcript-intro]'), [], keySentences);

    data.chapters.forEach((chapter, chapterIndex) => {
      const nextStartId = Number(data.chapters[chapterIndex + 1]?.segmentStartId ?? data.segments.length);
      const chapterParagraphs = data.paragraphs.filter(paragraph => Number(paragraph.segmentStartId) >= Number(chapter.segmentStartId) && Number(paragraph.segmentStartId) < nextStartId);
      const container = document.querySelector(`[data-transcript-chapter="${chapter.id}"]`);
      renderGroup(chapterParagraphs, segmentsById, container, data.highlights.filter(item => Number(item.chapter) === Number(chapter.id)), keySentences);
    });

    const segmentCount = document.querySelectorAll('.segment-anchor').length;
    const markerCount = document.querySelectorAll('.highlight-marker').length;
    const populatedChapters = [...document.querySelectorAll('[data-transcript-chapter]')].filter(element => element.children.length > 0).length;
    const keySentenceCount = document.querySelectorAll('.key-sentence').length;
    if (segmentCount !== 8142 || markerCount !== 35 || populatedChapters !== 7 || keySentenceCount !== editorialData.length) {
      throw new Error(`Render verification failed: ${segmentCount} segments, ${markerCount} markers, ${populatedChapters} chapters`);
    }

    rendered = true;
    chapterElements = [...document.querySelectorAll('.transcript-chapter')];
    markerElements = [...document.querySelectorAll('.highlight-marker')];
    loading.hidden = true;
    error.hidden = true;
    transcript.setAttribute('aria-busy', 'false');
    transcript.dataset.segmentCount = String(segmentCount);
    if (location.hash) moveToHash(location.hash, { smooth: false });
    updateViewportState();
    updateProgress();
    if (location.hash) {
      const settleHash = () => {
        if (!initialHashPending) return;
        moveToHash(location.hash, { smooth: false });
        updateViewportState();
      };
      requestAnimationFrame(() => requestAnimationFrame(settleHash));
      [120, 500, 1200].forEach(delay => window.setTimeout(settleHash, delay));
      window.setTimeout(() => { initialHashPending = false; }, 1250);
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

  // The reading line is 26 CSS pixels below the fixed header. Within [start, end),
  // chapter progress is clamp((readingLine - start) / (end - start), 0, 1).
  const updateChapterProgress = (currentChapter, readingLine) => {
    const chapterChanged = currentChapter !== progressChapter;
    progressChapter = currentChapter;
    let amount = 0;
    let label = '랴오헝 인터뷰';
    if (currentChapter) {
      const index = chapterElements.indexOf(currentChapter);
      const nextChapter = chapterElements[index + 1];
      const start = window.scrollY + currentChapter.getBoundingClientRect().top;
      const end = nextChapter
        ? window.scrollY + nextChapter.getBoundingClientRect().top
        : document.documentElement.scrollHeight - window.innerHeight + (readingLine - window.scrollY);
      amount = end > start ? Math.min(1, Math.max(0, (readingLine - start) / (end - start))) : 0;
      label = currentChapter.querySelector('.chapter-heading h2')?.textContent || '';
    }
    if (chapterChanged) chapterProgressFill.classList.add('is-chapter-change');
    chapterProgressFill.style.transform = `scaleX(${amount})`;
    chapterProgress.setAttribute('aria-valuenow', String(Math.round(amount * 100)));
    chapterProgress.setAttribute('aria-label', `${label} 읽기 진행률`);
    if (chapterChanged) requestAnimationFrame(() => chapterProgressFill.classList.remove('is-chapter-change'));
  };

  const updateViewportState = () => {
    scrollTicking = false;
    const header = document.querySelector('.site-header');
    const probe = (header ? header.getBoundingClientRect().bottom : 64) + 26;
    const readingLine = window.scrollY + probe;
    let currentChapter = null;
    for (const chapter of chapterElements) {
      if (chapter.getBoundingClientRect().top <= probe) currentChapter = chapter;
      else break;
    }
    if (!currentChapter || transcript.getBoundingClientRect().top > probe) {
      chapterNumber.textContent = '00';
      readingStatus.textContent = 'OVERVIEW';
      activeChapter = null;
      activeTopic = null;
      setActiveLinks('[data-nav-chapter]', 'navChapter', null);
      setActiveLinks('[data-nav-topic]', 'navTopic', null);
      renderRailTopics(null);
      updateChapterProgress(null, readingLine);
      return;
    }

    const number = currentChapter.dataset.chapter;
    activeChapter = number;
    chapterNumber.textContent = `CH ${String(number).padStart(2, '0')}`;
    readingStatus.textContent = currentChapter.querySelector('.chapter-heading h2')?.textContent || '';
    setActiveLinks('[data-nav-chapter]', 'navChapter', number);
    renderRailTopics(number);

    let currentMarker = null;
    for (const marker of markerElements) {
      if (marker.getBoundingClientRect().top <= probe) currentMarker = marker;
      else break;
    }
    const markerInChapter = currentMarker?.dataset.chapter === number ? currentMarker.dataset.topic : null;
    activeTopic = markerInChapter;
    setActiveLinks('[data-nav-topic]', 'navTopic', markerInChapter);
    setActiveLinks('[data-rail-topic]', 'railTopic', markerInChapter);
    updateChapterProgress(currentChapter, readingLine);
  };

  const updateProgress = () => {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const amount = height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 0;
    progressBar.style.width = `${amount}%`;
    railPercent.textContent = `${Math.round(amount)}%`;
    backToTop.classList.toggle('visible', window.scrollY > window.innerHeight * 0.7);
  };

  const onScroll = () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(() => {
        updateProgress();
        updateViewportState();
      });
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
  updateProgress();

  Promise.all(['transcript-ko.json', 'key-sentences.json'].map(url => fetch(url).then(response => {
    if (!response.ok) throw new Error(`${url} request failed (${response.status})`);
    return response.json();
  })))
    .then(([data, editorialData]) => renderTranscript(data, editorialData))
    .catch(reason => {
      console.error(reason);
      loading.hidden = true;
      error.hidden = false;
      transcript.setAttribute('aria-busy', 'false');
      transcript.classList.add('load-failed');
    });
})();
