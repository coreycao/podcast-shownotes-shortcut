import { sanitizeShownotes } from './sanitize.js';

(function() {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const views = { home: $('#viewHome'), episodes: $('#viewEpisodes'), shownotes: $('#viewShowNotes') };

  const { CORS_PROXY_URL } = globalThis.CONFIG;

  let currentPodcast = null;
  let currentEpisodes = [];
  let targetEpisodeId = null;
  let episodeLoadKey = '';

  // --- Theme ---
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('#themeToggle').textContent = dark ? '☀️' : '🌙';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#1a1a2e' : '#5e5ce6';
  }
  if (savedTheme) {
    applyTheme(savedTheme === 'dark');
  } else {
    applyTheme(prefersDark.matches);
  }
  $('#themeToggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(!isDark);
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
  });
  prefersDark.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) applyTheme(e.matches);
  });

  // --- Offline detection ---
  function updateOfflineBanner() {
    const banner = $('#offlineBanner');
    if (!navigator.onLine) {
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();

  // --- View switching ---
  function showView(name) {
    Object.entries(views).forEach(([k, el]) => {
      el.classList.toggle('active', k === name);
    });
    window.scrollTo(0, 0);
  }

  // --- Routing ---
  function navigateTo(hash) {
    if (hash) {
      location.hash = hash;
    } else {
      history.pushState(null, '', location.pathname);
      handleRoute();
    }
  }

  function handleRoute() {
    const hash = location.hash.slice(1);
    if (!hash) {
      showView('home');
      return;
    }
    const parts = hash.split('/');
    if (parts[0] === 'episodes' && parts[1]) {
      const podcastId = parts[1];
      if (!currentPodcast || currentPodcast.collectionId !== podcastId) {
        loadPodcastById(podcastId);
      } else if (!currentEpisodes.length) {
        renderPodcastHeader();
        showView('episodes');
        loadEpisodes();
      } else {
        showView('episodes');
      }
    } else if (parts[0] === 'shownotes' && parts[1] && parts[2]) {
      const podcastId = parts[1];
      const idx = parseInt(parts[2], 10);
      if (!currentPodcast || currentPodcast.collectionId !== podcastId) {
        loadPodcastAndShowNote(podcastId, idx);
      } else {
        renderShowNotes(idx);
        showView('shownotes');
      }
    } else {
      showView('home');
    }
  }

  window.addEventListener('hashchange', handleRoute);

  // --- Deep link handling ---
  function handleDeepLink() {
    const params = new URLSearchParams(location.search);
    let podcastId = null;
    let episodeId = null;

    // ?url=https://podcasts.apple.com/.../id1253186678?i=1000678901234
    const urlParam = params.get('url');
    if (urlParam) {
      const idMatch = urlParam.match(/\/id(\d+)/);
      if (idMatch) podcastId = idMatch[1];
      const epMatch = urlParam.match(/[?&]i=(\d+)/);
      if (epMatch) episodeId = epMatch[1];
    }

    // ?podcastId=1253186678&episodeId=1000678901234
    if (!podcastId) {
      podcastId = params.get('podcastId');
    }
    if (!episodeId) {
      episodeId = params.get('episodeId');
    }

    if (podcastId) {
      // Clean URL: replace query params with hash route
      const cleanUrl = location.pathname;
      history.replaceState(null, '', cleanUrl);
      targetEpisodeId = episodeId || null;
      navigateTo('episodes/' + podcastId);
      return true;
    }
    return false;
  }

  // --- iTunes API ---
  async function searchPodcasts(term) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&entity=podcast&limit=20`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('iTunes search failed');
    return (await res.json()).results;
  }

  async function lookupPodcast(id) {
    const url = `https://itunes.apple.com/lookup?id=${id}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('iTunes lookup failed');
    const data = await res.json();
    if (!data.results || !data.results.length) throw new Error('Podcast not found');
    return data.results[0];
  }

  // --- RSS parsing ---
  async function fetchRSS(feedUrl) {
    // Strategy 1: Direct fetch
    try {
      const res = await fetch(feedUrl);
      if (res.ok) {
        const xml = await res.text();
        const items = parseRSSXML(xml);
        if (items.length) return items;
      }
    } catch {}

    // Strategy 2: CORS proxy
    try {
      const proxyUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(feedUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const xml = await res.text();
        const items = parseRSSXML(xml);
        if (items.length) return items;
      }
    } catch {}

    throw new Error('RSS 源暂时不可用');
  }

  function parseRSSXML(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) return [];

    return [...doc.querySelectorAll('item')].map((item) => {
      const getText = (tag) => {
        const el = item.getElementsByTagName(tag)[0];
        return el ? el.textContent : '';
      };
      const content = (() => {
        const encoded = item.getElementsByTagNameNS('*', 'encoded')[0];
        if (encoded) return encoded.textContent;
        return getText('description');
      })();
      const enclosure = item.querySelector('enclosure');
      const duration = item.getElementsByTagNameNS('*', 'duration')[0];
      const guid = item.querySelector('guid');
      return {
        title: getText('title'),
        pubDate: getText('pubDate'),
        guid: guid ? guid.textContent : '',
        link: getText('link'),
        content,
        enclosure: enclosure ? enclosure.getAttribute('url') : '',
        duration: duration ? duration.textContent : '',
      };
    });
  }

  // --- Rendering ---
  function renderLoading(container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  }

  function renderError(container, message, retryFn) {
    container.innerHTML = `
      <div class="error-state">
        <div class="icon">😕</div>
        <p>${esc(message)}</p>
        ${retryFn ? '<button type="button" class="retry-btn">重试</button>' : ''}
      </div>`;
    const retryBtn = container.querySelector('.retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', retryFn);
  }

  function renderSearchResults(results) {
    const container = $('#searchResults');
    if (!results.length) {
      container.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>没有找到相关播客</p></div>';
      return;
    }
    container.innerHTML = '<div class="results-grid">' + results.map((r) => {
      const artwork = (r.artworkUrl100 || '').replace('100x100', '200x200');
      return `
        <div class="podcast-card" data-id="${r.collectionId}" data-feed="${encodeURIComponent(r.feedUrl || '')}">
          <img src="${artwork}" alt="" loading="lazy">
          <div class="info">
            <h3>${esc(r.collectionName)}</h3>
            <p>${esc(r.artistName)}</p>
            <div class="meta">
              ${r.primaryGenreName ? `<span>${esc(r.primaryGenreName)}</span>` : ''}
              ${r.trackCount ? `<span>${r.trackCount} 集</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('') + '</div>';

    container.querySelectorAll('.podcast-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const feedUrl = decodeURIComponent(card.dataset.feed);
        const name = card.querySelector('h3').textContent;
        const artist = card.querySelector('p').textContent;
        const artwork = card.querySelector('img').src;
        const genre = card.querySelector('.meta span')?.textContent || '';
        currentPodcast = {
          collectionId: id,
          collectionName: name,
          artistName: artist,
          artworkUrl600: artwork,
          primaryGenreName: genre,
          feedUrl,
        };
        targetEpisodeId = null;
        renderPodcastHeader();
        showView('episodes');
        location.hash = 'episodes/' + id;
      });
    });
  }

  async function loadPodcastById(podcastId) {
    showView('episodes');
    renderLoading($('#episodeList'));

    try {
      const info = await lookupPodcast(podcastId);
      if (!info.feedUrl) {
        renderError($('#episodeList'), '该播客没有 RSS Feed', loadPodcastById.bind(null, podcastId));
        return;
      }
      currentPodcast = {
        collectionId: String(info.collectionId),
        collectionName: info.collectionName,
        artistName: info.artistName,
        artworkUrl600: (info.artworkUrl600 || info.artworkUrl100 || '').replace('100x100', '600x600'),
        primaryGenreName: info.primaryGenreName || '',
        feedUrl: info.feedUrl,
      };
      currentEpisodes = [];
      episodeLoadKey = '';
      renderPodcastHeader();
      await loadEpisodes();
    } catch (e) {
      renderError($('#podcastHeader'), '加载播客信息失败', () => {
        location.hash = '';
        showView('home');
      });
    }
  }

  async function loadPodcastAndShowNote(podcastId, idx) {
    showView('episodes');
    renderLoading($('#episodeList'));
    try {
      const info = await lookupPodcast(podcastId);
      if (!info.feedUrl) {
        renderError($('#episodeList'), '该播客没有 RSS Feed');
        return;
      }
      currentPodcast = {
        collectionId: String(info.collectionId),
        collectionName: info.collectionName,
        artistName: info.artistName,
        artworkUrl600: (info.artworkUrl600 || info.artworkUrl100 || '').replace('100x100', '600x600'),
        primaryGenreName: info.primaryGenreName || '',
        feedUrl: info.feedUrl,
      };
      currentEpisodes = [];
      episodeLoadKey = '';
      renderPodcastHeader();
      await loadEpisodes();
      renderShowNotes(idx);
      showView('shownotes');
    } catch (e) {
      renderError($('#podcastHeader'), '加载播客信息失败');
    }
  }

  function renderPodcastHeader() {
    if (!currentPodcast) return;
    $('#podcastHeader').innerHTML = `
      <div class="podcast-header">
        <img src="${currentPodcast.artworkUrl600}" alt="" loading="lazy">
        <div class="info">
          <h2>${esc(currentPodcast.collectionName)}</h2>
          <p>${esc(currentPodcast.artistName)}</p>
        </div>
      </div>`;
  }

  async function loadEpisodes() {
    const loadKey = currentPodcast?.collectionId + '|' + currentPodcast?.feedUrl;
    if (currentEpisodes.length && episodeLoadKey === loadKey) {
      renderEpisodeList();
      return;
    }
    renderLoading($('#episodeList'));
    try {
      currentEpisodes = await fetchRSS(currentPodcast.feedUrl);
      episodeLoadKey = loadKey;
      if (!currentEpisodes.length) {
        renderError($('#episodeList'), '该播客没有剧集');
        return;
      }
      renderEpisodeList();
    } catch (e) {
      renderError($('#episodeList'), 'RSS 源暂时不可用', loadEpisodes);
    }
  }

  function renderEpisodeList() {
    const container = $('#episodeList');
    container.innerHTML = '<div class="episode-list">' + currentEpisodes.map((ep, i) => {
      const date = ep.pubDate ? formatDate(ep.pubDate) : '';
      const duration = ep.duration ? formatDuration(ep.duration) : '';
      return `
        <div class="episode-card" data-idx="${i}">
          <h3>${esc(ep.title || '无标题')}</h3>
          <div class="meta">
            ${date ? `<span>${date}</span>` : ''}
            ${duration ? `<span>${duration}</span>` : ''}
          </div>
        </div>`;
    }).join('') + '</div>';

    container.querySelectorAll('.episode-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx, 10);
        navigateTo('shownotes/' + currentPodcast.collectionId + '/' + idx);
      });
    });

    // Auto-locate episode by episodeId: navigate directly to show notes
    if (targetEpisodeId) {
      autoLocateEpisode(targetEpisodeId);
      targetEpisodeId = null;
    }
  }

  async function autoLocateEpisode(episodeId) {
    // Strategy 1: direct match in guid/link/enclosure
    let idx = currentEpisodes.findIndex((ep) => {
      const haystack = (ep.guid || '') + (ep.link || '') + (ep.enclosure || '');
      return haystack.includes(episodeId);
    });

    // Strategy 2: iTunes Lookup by podcastId + entity=podcastEpisode,
    // find the episode with trackId === episodeId, match by title in RSS
    if (idx < 0 && currentPodcast) {
      try {
        const url = `https://itunes.apple.com/lookup?id=${currentPodcast.collectionId}&entity=podcastEpisode&limit=200`;
        const res = await fetch(url);
        const data = await res.json();
        const episodes = (data.results || []).filter((r) => r.wrapperType === 'podcastEpisode');
        const match = episodes.find((e) => String(e.trackId) === episodeId);
        if (match && match.trackName) {
          const lookupTitle = normalizeTitle(match.trackName);
          // Try exact match first
          idx = currentEpisodes.findIndex((ep) => {
            const t = normalizeTitle(ep.title);
            return t === lookupTitle || t.includes(lookupTitle) || lookupTitle.includes(t);
          });
          // Fallback: match by episode number (e.g. "#202" or "No.202")
          if (idx < 0) {
            const numMatch = match.trackName.match(/^#?\s*(\d+)\b/i);
            if (numMatch) {
              const epNum = numMatch[1];
              idx = currentEpisodes.findIndex((ep) => {
                return (ep.title || '').match(new RegExp('(?:^|#|No\.?|EP\.?)\\s*' + epNum + '\\b', 'i'));
              });
            }
          }
          // Fallback: prefix match on first 20 meaningful chars
          if (idx < 0 && lookupTitle.length >= 15) {
            const prefix = lookupTitle.slice(0, 20);
            idx = currentEpisodes.findIndex((ep) => {
              return normalizeTitle(ep.title).indexOf(prefix) >= 0;
            });
          }
        }
      } catch {}
    }

    if (idx >= 0 && currentPodcast) {
      navigateTo('shownotes/' + currentPodcast.collectionId + '/' + idx);
    } else if (episodeId) {
      // Auto-locate failed: show hint at top of episode list
      const hint = document.createElement('div');
      hint.className = 'offline-banner show episode-hint';
      hint.textContent = '未找到对应剧集，请手动查找';
      const container = $('#episodeList');
      if (container) container.insertBefore(hint, container.firstChild);
    }
  }

  function normalizeTitle(t) {
    return (t || '').toLowerCase().replace(/[^\w一-鿿]/g, '').trim();
  }

  function renderShowNotes(idx) {
    const ep = currentEpisodes[idx];
    if (!ep) return;
    const date = ep.pubDate ? formatDate(ep.pubDate) : '';
    $('#shownotesContent').innerHTML = `
      <div class="shownotes-header">
        <h2>${esc(ep.title || '无标题')}</h2>
        <div class="meta">${date}</div>
      </div>
      <div class="shownotes-content">${sanitizeShownotes(ep.content) || '<p>该剧集没有 Show Notes</p>'}</div>`;
    showView('shownotes');
    window.scrollTo(0, 0);
  }

  // --- Search ---
  async function doSearch() {
    const term = $('#searchInput').value.trim();
    if (!term) return;
    const container = $('#searchResults');
    renderLoading(container);
    try {
      const results = await searchPodcasts(term);
      renderSearchResults(results);
    } catch (e) {
      renderError(container, '搜索失败，请重试', doSearch);
    }
  }

  $('#searchBtn').addEventListener('click', doSearch);
  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // --- Back buttons ---
  $('#backToSearch').addEventListener('click', () => {
    currentPodcast = null;
    currentEpisodes = [];
    navigateTo('');
  });
  $('#backToEpisodes').addEventListener('click', () => {
    navigateTo('episodes/' + (currentPodcast?.collectionId || ''));
  });

  // --- Helpers ---
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function formatDuration(dur) {
    if (/^\d+$/.test(dur)) {
      const s = parseInt(dur, 10);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (h) return `${h}h ${m}m`;
      return `${m || Math.floor(s / 60)}m`;
    }
    return dur;
  }

  // --- Init ---
  if (!handleDeepLink()) {
    handleRoute();
  }

  // --- Service Worker ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
