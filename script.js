(() => {
  const body = document.body;
  const drawer = document.getElementById('tocDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const menuButton = document.getElementById('menuButton');
  const closeButton = document.getElementById('closeDrawer');
  const progressBar = document.getElementById('progressBar');
  const railPercent = document.getElementById('railPercent');
  const backToTop = document.getElementById('backToTop');
  const status = document.getElementById('readingStatus');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastFocus = null;

  const openDrawer = () => {
    lastFocus = document.activeElement;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    menuButton.setAttribute('aria-expanded', 'true');
    backdrop.hidden = false;
    body.classList.add('drawer-open');
    closeButton.focus();
  };

  const closeDrawer = () => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    menuButton.setAttribute('aria-expanded', 'false');
    backdrop.hidden = true;
    body.classList.remove('drawer-open');
    if (lastFocus) lastFocus.focus();
  };

  menuButton.addEventListener('click', openDrawer);
  closeButton.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  drawer.querySelectorAll('a').forEach(link => link.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    if (event.key === 'Tab' && drawer.classList.contains('open')) {
      const focusable = [...drawer.querySelectorAll('a, button, summary')].filter(el => !el.hidden);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  const updateProgress = () => {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const amount = height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 0;
    progressBar.style.width = `${amount}%`;
    railPercent.textContent = `${Math.round(amount)}%`;
    backToTop.classList.toggle('visible', window.scrollY > window.innerHeight * .7);
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

  const sections = [...document.querySelectorAll('.chapter, .topic')];
  const chapterLinks = [...document.querySelectorAll('[data-nav-chapter]')];
  const topicLinks = [...document.querySelectorAll('[data-nav-topic]')];
  const visible = new Map();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => visible.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
    const active = [...visible.entries()].filter(([, ratio]) => ratio > 0).sort((a, b) => b[1] - a[1])[0];
    if (!active) return;
    const element = active[0];
    const chapter = element.closest('.chapter');
    const chapterNumber = chapter?.dataset.chapter;
    const topicNumber = element.dataset.topic;
    chapterLinks.forEach(link => link.classList.toggle('active', link.dataset.navChapter === chapterNumber));
    topicLinks.forEach(link => link.classList.toggle('active', link.dataset.navTopic === topicNumber));
    const title = element.querySelector('h2, h3')?.textContent;
    if (title) status.textContent = title;
  }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, .1, .3, .6] });
  sections.forEach(section => observer.observe(section));
})();
