const BOOKMARKS_KEY = 'devfest_kisumu_2026_bookmarks';
const THEME_KEY = 'devfest_kisumu_2026_theme';

const state = {
  view: 'schedule', // 'schedule' | 'speakers' | 'my-schedule'
  event: null,
  sessions: [],
  speakers: [],
  filters: {
    q: '',
    track: '',
    room: '',
    level: '',
  },
  bookmarks: new Set(loadBookmarks()),
};

// DOM references
const els = {
  eventOrganizer: document.getElementById('event-organizer'),
  eventTitle: document.getElementById('event-title'),
  eventTagline: document.getElementById('event-tagline'),
  metaDate: document.getElementById('meta-date'),
  metaVenue: document.getElementById('meta-venue'),
  metaTimezone: document.getElementById('meta-timezone'),
  statSessions: document.getElementById('stat-sessions'),
  statSpeakers: document.getElementById('stat-speakers'),
  statTracks: document.getElementById('stat-tracks'),
  statRooms: document.getElementById('stat-rooms'),
  bookmarkCount: document.getElementById('bookmark-count'),
  searchInput: document.getElementById('search-input'),
  roomFilter: document.getElementById('room-filter'),
  levelFilter: document.getElementById('level-filter'),
  scheduleSelects: document.getElementById('schedule-selects'),
  clearFilters: document.getElementById('clear-filters'),
  trackChips: document.getElementById('track-chips'),
  resultsSummary: document.getElementById('results-summary'),
  conflictBanner: document.getElementById('conflict-banner'),
  conflictText: document.getElementById('conflict-text'),
  contentRoot: document.getElementById('content-root'),
  tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
  themeToggle: document.getElementById('theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),
  modal: document.getElementById('detail-modal'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...state.bookmarks]));
  } catch {
    // Ignore storage quota errors
  }
  els.bookmarkCount.textContent = String(state.bookmarks.size);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark =
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  els.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, theme);
}

function parseMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns a Set of session IDs that overlap in time with another session in the list.
 */
function findConflictingSessionIds(sessions) {
  const conflicts = new Set();
  for (let i = 0; i < sessions.length; i += 1) {
    const aStart = parseMinutes(sessions[i].startTime);
    const aEnd = parseMinutes(sessions[i].endTime);
    for (let j = i + 1; j < sessions.length; j += 1) {
      const bStart = parseMinutes(sessions[j].startTime);
      const bEnd = parseMinutes(sessions[j].endTime);
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.add(sessions[i].id);
        conflicts.add(sessions[j].id);
      }
    }
  }
  return conflicts;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  return res.json();
}

function renderEventMetadata(event) {
  els.eventOrganizer.textContent = event.organizer || 'GDG Kisumu';
  els.eventTitle.textContent = event.name || 'DevFest Kisumu 2026';
  els.eventTagline.textContent = event.tagline || '';
  els.metaDate.textContent = `📅 ${event.displayDate || event.date}`;
  els.metaVenue.textContent = `📍 ${event.venue}`;
  els.metaTimezone.textContent = `🕒 ${event.timezone}`;

  els.statSessions.textContent = String(event.stats?.totalSessions ?? 0);
  els.statSpeakers.textContent = String(event.stats?.totalSpeakers ?? 0);
  els.statTracks.textContent = String(event.stats?.totalTracks ?? 0);
  els.statRooms.textContent = String(event.stats?.totalRooms ?? 0);

  // Populate rooms dropdown
  els.roomFilter.innerHTML =
    '<option value="">All Rooms</option>' +
    (event.rooms || [])
      .map(
        (room) =>
          `<option value="${escapeHtml(room)}">${escapeHtml(room)}</option>`
      )
      .join('');

  // Populate levels dropdown
  els.levelFilter.innerHTML =
    '<option value="">All Levels</option>' +
    (event.levels || [])
      .map(
        (level) =>
          `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`
      )
      .join('');

  // Populate track filter chips
  const chipsHtml = [
    `<button class="chip active" data-track="" type="button">All Tracks</button>`,
    ...(event.tracks || []).map(
      (track) => `
        <button class="chip" data-track="${escapeHtml(track.id)}" type="button">
          <span class="chip-dot" style="background:${escapeHtml(track.color)}"></span>
          ${escapeHtml(track.name)}
        </button>
      `
    ),
  ].join('');
  els.trackChips.innerHTML = chipsHtml;
}

function updateFilterUi() {
  const hasFilters = Boolean(
    state.filters.q ||
      state.filters.track ||
      state.filters.room ||
      state.filters.level
  );
  els.clearFilters.classList.toggle('hidden', !hasFilters);

  const isSpeakersView = state.view === 'speakers';
  els.scheduleSelects.classList.toggle('hidden', isSpeakersView);

  els.trackChips.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.track === state.filters.track);
  });

  els.tabButtons.forEach((btn) => {
    const active = btn.dataset.view === state.view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

async function loadCurrentView() {
  updateFilterUi();
  els.conflictBanner.classList.add('hidden');

  try {
    if (state.view === 'speakers') {
      const params = new URLSearchParams();
      if (state.filters.q) params.set('q', state.filters.q);
      if (state.filters.track) params.set('track', state.filters.track);

      const data = await fetchJson(`/api/speakers?${params.toString()}`);
      state.speakers = data.speakers;
      renderSpeakersView(data.speakers);
      return;
    }

    if (state.view === 'my-schedule') {
      if (state.bookmarks.size === 0) {
        state.sessions = [];
        renderScheduleView([], { isMySchedule: true });
        return;
      }

      const params = new URLSearchParams();
      params.set('ids', [...state.bookmarks].join(','));
      if (state.filters.q) params.set('q', state.filters.q);
      if (state.filters.track) params.set('track', state.filters.track);
      if (state.filters.room) params.set('room', state.filters.room);
      if (state.filters.level) params.set('level', state.filters.level);

      const data = await fetchJson(`/api/schedule?${params.toString()}`);
      state.sessions = data.sessions;
      renderScheduleView(data.sessions, { isMySchedule: true });
      return;
    }

    // Default: Full Schedule
    const params = new URLSearchParams();
    if (state.filters.q) params.set('q', state.filters.q);
    if (state.filters.track) params.set('track', state.filters.track);
    if (state.filters.room) params.set('room', state.filters.room);
    if (state.filters.level) params.set('level', state.filters.level);

    const data = await fetchJson(`/api/schedule?${params.toString()}`);
    state.sessions = data.sessions;
    renderScheduleView(data.sessions, { isMySchedule: false });
  } catch (error) {
    els.resultsSummary.textContent = 'Unable to load schedule data.';
    els.contentRoot.innerHTML = `
      <div class="empty-state">
        <h3>Something went wrong</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderScheduleView(sessions, { isMySchedule }) {
  const conflictIds = isMySchedule
    ? findConflictingSessionIds(sessions)
    : new Set();

  if (isMySchedule && conflictIds.size > 0) {
    els.conflictBanner.classList.remove('hidden');
    els.conflictText.textContent = `You have ${conflictIds.size} overlapping sessions saved in My Schedule. Review the highlighted cards below.`;
  }

  if (sessions.length === 0) {
    els.resultsSummary.textContent = isMySchedule
      ? '0 saved sessions shown'
      : '0 sessions match your current filters';

    els.contentRoot.innerHTML = isMySchedule
      ? `
        <div class="empty-state">
          <h3>Your personal schedule is empty</h3>
          <p>Browse the Schedule tab and click <strong>☆ Save</strong> on sessions you plan to attend at DevFest Kisumu 2026.</p>
        </div>
      `
      : `
        <div class="empty-state">
          <h3>No matching sessions found</h3>
          <p>Try clearing your search or selecting a different track, room, or level.</p>
        </div>
      `;
    return;
  }

  els.resultsSummary.textContent = isMySchedule
    ? `Showing ${sessions.length} saved session${sessions.length === 1 ? '' : 's'} in My Schedule`
    : `Showing ${sessions.length} session${sessions.length === 1 ? '' : 's'}`;

  // Group chronologically by startTime
  const slots = new Map();
  for (const session of sessions) {
    const key = session.startTime;
    if (!slots.has(key)) {
      slots.set(key, []);
    }
    slots.get(key).push(session);
  }

  const timelineHtml = Array.from(slots.entries())
    .map(([startTime, slotSessions]) => {
      const endTimes = Array.from(new Set(slotSessions.map((s) => s.endTime)));
      const rangeText =
        endTimes.length === 1
          ? `${startTime} – ${endTimes[0]}`
          : `${startTime} onwards`;

      const cardsHtml = slotSessions
        .map((session) => renderSessionCard(session, conflictIds.has(session.id)))
        .join('');

      return `
        <section class="time-slot" aria-label="Time slot ${escapeHtml(startTime)}">
          <div class="time-label">
            <span class="time-start">${escapeHtml(startTime)}</span>
            <span class="time-range">${escapeHtml(rangeText)}</span>
          </div>
          <div class="slot-sessions">${cardsHtml}</div>
        </section>
      `;
    })
    .join('');

  els.contentRoot.innerHTML = `<div class="timeline">${timelineHtml}</div>`;
}

function renderSessionCard(session, hasConflict) {
  const isSaved = state.bookmarks.has(session.id);
  const trackColor = session.trackMeta?.color || '#4285F4';
  const trackName = session.trackMeta?.name || session.track;

  const speakersHtml =
    session.speakers?.length > 0
      ? `
        <div class="speaker-chips">
          ${session.speakers
            .map(
              (sp) => `
                <button
                  class="speaker-pill"
                  type="button"
                  data-speaker-id="${escapeHtml(sp.id)}"
                >
                  <span class="avatar-sm" style="background:${escapeHtml(sp.accentColor || trackColor)}">
                    ${escapeHtml(sp.initials || sp.name.slice(0, 2).toUpperCase())}
                  </span>
                  <span>${escapeHtml(sp.name)}</span>
                </button>
              `
            )
            .join('')}
        </div>
      `
      : '';

  const tagsHtml =
    session.tags?.length > 0
      ? `
        <div class="tag-list">
          ${session.tags
            .slice(0, 4)
            .map((t) => `<span class="tag-item">#${escapeHtml(t)}</span>`)
            .join('')}
        </div>
      `
      : '';

  return `
    <article
      class="session-card ${hasConflict ? 'has-conflict' : ''}"
      style="--track-color: ${escapeHtml(trackColor)}"
    >
      <div class="card-top">
        <span class="track-pill" style="background:${escapeHtml(trackColor)}">
          ${escapeHtml(trackName)} · ${escapeHtml(session.type)}
        </span>
        <button
          class="bookmark-btn ${isSaved ? 'saved' : ''}"
          type="button"
          data-bookmark-id="${escapeHtml(session.id)}"
          aria-pressed="${isSaved}"
        >
          ${isSaved ? '★ Saved' : '☆ Save'}
        </button>
      </div>

      <h3 class="session-title">
        <button type="button" data-session-id="${escapeHtml(session.id)}">
          ${escapeHtml(session.title)}
        </button>
      </h3>

      <p class="session-desc">${escapeHtml(session.description)}</p>

      <div class="session-meta-row">
        <span>🕒 ${escapeHtml(session.startTime)} – ${escapeHtml(session.endTime)}</span>
        <span>📍 ${escapeHtml(session.room)}</span>
        <span>🎯 ${escapeHtml(session.level)}</span>
        ${hasConflict ? '<span class="conflict-tag">⚠ Overlaps</span>' : ''}
      </div>

      ${tagsHtml}
      ${speakersHtml}
    </article>
  `;
}

function renderSpeakersView(speakers) {
  if (speakers.length === 0) {
    els.resultsSummary.textContent = '0 speakers match your current filters';
    els.contentRoot.innerHTML = `
      <div class="empty-state">
        <h3>No matching speakers found</h3>
        <p>Try searching by a different name, company, or track.</p>
      </div>
    `;
    return;
  }

  els.resultsSummary.textContent = `Showing ${speakers.length} speaker${speakers.length === 1 ? '' : 's'}`;

  const gridHtml = speakers
    .map((speaker) => {
      const sessionsHtml =
        speaker.sessions?.length > 0
          ? speaker.sessions
              .map(
                (s) => `
                  <button
                    class="mini-session-btn"
                    type="button"
                    data-session-id="${escapeHtml(s.id)}"
                  >
                    <span class="mini-session-time">
                      ${escapeHtml(s.startTime)} – ${escapeHtml(s.endTime)} · ${escapeHtml(s.room)}
                    </span>
                    <span class="mini-session-title">${escapeHtml(s.title)}</span>
                  </button>
                `
              )
              .join('')
          : '<span class="results-summary">No sessions assigned</span>';

      return `
        <article class="speaker-card">
          <div class="speaker-header">
            <span class="avatar-lg" style="background:${escapeHtml(speaker.accentColor || '#4285F4')}">
              ${escapeHtml(speaker.initials || speaker.name.slice(0, 2).toUpperCase())}
            </span>
            <div>
              <h3 class="speaker-name">
                <button type="button" data-speaker-id="${escapeHtml(speaker.id)}">
                  ${escapeHtml(speaker.name)}
                </button>
              </h3>
              <p class="speaker-role">
                ${escapeHtml(speaker.role)} · <strong>${escapeHtml(speaker.company)}</strong>
              </p>
            </div>
          </div>

          <p class="speaker-bio">${escapeHtml(speaker.bio)}</p>

          <div class="speaker-sessions-list">
            ${sessionsHtml}
          </div>
        </article>
      `;
    })
    .join('');

  els.contentRoot.innerHTML = `<div class="speakers-grid">${gridHtml}</div>`;
}

async function openSessionModal(sessionId) {
  try {
    const session = await fetchJson(`/api/schedule/${encodeURIComponent(sessionId)}`);
    const isSaved = state.bookmarks.has(session.id);
    const trackColor = session.trackMeta?.color || '#4285F4';
    const trackName = session.trackMeta?.name || session.track;

    const speakersBlock =
      session.speakers?.length > 0
        ? `
          <h4 class="modal-section-title">Speakers</h4>
          <div class="speaker-chips">
            ${session.speakers
              .map(
                (sp) => `
                  <button
                    class="speaker-pill"
                    type="button"
                    data-speaker-id="${escapeHtml(sp.id)}"
                  >
                    <span class="avatar-sm" style="background:${escapeHtml(sp.accentColor || trackColor)}">
                      ${escapeHtml(sp.initials || sp.name.slice(0, 2).toUpperCase())}
                    </span>
                    <span>${escapeHtml(sp.name)} (${escapeHtml(sp.company)})</span>
                  </button>
                `
              )
              .join('')}
          </div>
        `
        : '';

    els.modalBody.innerHTML = `
      <span class="track-pill" style="background:${escapeHtml(trackColor)}">
        ${escapeHtml(trackName)} · ${escapeHtml(session.type)}
      </span>
      <h2 id="modal-title" class="modal-title">${escapeHtml(session.title)}</h2>
      <div class="session-meta-row">
        <span>🕒 ${escapeHtml(session.startTime)} – ${escapeHtml(session.endTime)} (EAT)</span>
        <span>📍 ${escapeHtml(session.room)}</span>
        <span>🎯 ${escapeHtml(session.level)}</span>
      </div>
      <h4 class="modal-section-title">Session Abstract</h4>
      <p>${escapeHtml(session.description)}</p>
      ${
        session.tags?.length
          ? `<div class="tag-list">${session.tags
              .map((t) => `<span class="tag-item">#${escapeHtml(t)}</span>`)
              .join('')}</div>`
          : ''
      }
      ${speakersBlock}
      <div class="modal-actions">
        <button
          class="bookmark-btn ${isSaved ? 'saved' : ''}"
          type="button"
          data-bookmark-id="${escapeHtml(session.id)}"
        >
          ${isSaved ? '★ Saved in My Schedule' : '☆ Add to My Schedule'}
        </button>
      </div>
    `;

    els.modal.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to open session modal:', error);
  }
}

async function openSpeakerModal(speakerId) {
  try {
    const speaker = await fetchJson(`/api/speakers/${encodeURIComponent(speakerId)}`);
    const socials = speaker.socials || {};
    const socialLinks = [
      socials.x ? `<a class="social-link" href="${escapeHtml(socials.x)}" target="_blank" rel="noopener">X / Twitter</a>` : '',
      socials.github ? `<a class="social-link" href="${escapeHtml(socials.github)}" target="_blank" rel="noopener">GitHub</a>` : '',
      socials.linkedin ? `<a class="social-link" href="${escapeHtml(socials.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : '',
    ]
      .filter(Boolean)
      .join('');

    const sessionsList =
      speaker.sessions?.length > 0
        ? speaker.sessions
            .map(
              (s) => `
                <button
                  class="mini-session-btn"
                  type="button"
                  data-session-id="${escapeHtml(s.id)}"
                >
                  <span class="mini-session-time">
                    ${escapeHtml(s.startTime)} – ${escapeHtml(s.endTime)} · ${escapeHtml(s.room)}
                  </span>
                  <span class="mini-session-title">${escapeHtml(s.title)}</span>
                </button>
              `
            )
            .join('')
        : '<p class="results-summary">No sessions scheduled.</p>';

    els.modalBody.innerHTML = `
      <div class="speaker-header">
        <span class="avatar-lg" style="background:${escapeHtml(speaker.accentColor || '#4285F4')}">
          ${escapeHtml(speaker.initials || speaker.name.slice(0, 2).toUpperCase())}
        </span>
        <div>
          <h2 id="modal-title" class="modal-title" style="margin:0;">${escapeHtml(speaker.name)}</h2>
          <p class="speaker-role">${escapeHtml(speaker.role)} · <strong>${escapeHtml(speaker.company)}</strong></p>
        </div>
      </div>

      <h4 class="modal-section-title">About</h4>
      <p>${escapeHtml(speaker.bio)}</p>

      ${socialLinks ? `<div class="social-links">${socialLinks}</div>` : ''}

      <h4 class="modal-section-title">Scheduled Sessions</h4>
      <div class="speaker-sessions-list" style="border-top:none;padding-top:0;">
        ${sessionsList}
      </div>
    `;

    els.modal.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to open speaker modal:', error);
  }
}

function closeModal() {
  els.modal.classList.add('hidden');
}

function toggleBookmark(sessionId) {
  if (state.bookmarks.has(sessionId)) {
    state.bookmarks.delete(sessionId);
  } else {
    state.bookmarks.add(sessionId);
  }
  saveBookmarks();
  loadCurrentView();
}

function wireEvents() {
  els.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  els.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      loadCurrentView();
    });
  });

  let searchTimeout;
  els.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.q = e.target.value.trim();
      loadCurrentView();
    }, 180);
  });

  els.roomFilter.addEventListener('change', (e) => {
    state.filters.room = e.target.value;
    loadCurrentView();
  });

  els.levelFilter.addEventListener('change', (e) => {
    state.filters.level = e.target.value;
    loadCurrentView();
  });

  els.trackChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.filters.track = chip.dataset.track || '';
    loadCurrentView();
  });

  els.clearFilters.addEventListener('click', () => {
    state.filters = { q: '', track: '', room: '', level: '' };
    els.searchInput.value = '';
    els.roomFilter.value = '';
    els.levelFilter.value = '';
    loadCurrentView();
  });

  // Delegated click handler for cards & modal actions
  const handleInteractiveClick = (e) => {
    const bookmarkBtn = e.target.closest('[data-bookmark-id]');
    if (bookmarkBtn) {
      const id = bookmarkBtn.dataset.bookmarkId;
      toggleBookmark(id);
      if (!els.modal.classList.contains('hidden')) {
        openSessionModal(id);
      }
      return;
    }

    const sessionBtn = e.target.closest('[data-session-id]');
    if (sessionBtn) {
      openSessionModal(sessionBtn.dataset.sessionId);
      return;
    }

    const speakerBtn = e.target.closest('[data-speaker-id]');
    if (speakerBtn) {
      openSpeakerModal(speakerBtn.dataset.speakerId);
    }
  };

  els.contentRoot.addEventListener('click', handleInteractiveClick);
  els.modalBody.addEventListener('click', handleInteractiveClick);

  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.modal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

async function bootstrap() {
  initTheme();
  saveBookmarks();
  wireEvents();

  try {
    const event = await fetchJson('/api/event');
    state.event = event;
    renderEventMetadata(event);
    await loadCurrentView();
  } catch (error) {
    els.resultsSummary.textContent = 'Failed to initialize application.';
    els.contentRoot.innerHTML = `
      <div class="empty-state">
        <h3>Connection Error</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

bootstrap();
