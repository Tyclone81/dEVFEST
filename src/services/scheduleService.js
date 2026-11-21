import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_PATH = path.resolve(__dirname, '../../data/schedule.json');

/**
 * Service responsible for loading, caching (by file mtime), hydrating,
 * and querying the DevFest Kisumu 2026 schedule JSON file.
 */
export class ScheduleService {
  constructor(dataPath = DEFAULT_DATA_PATH) {
    this.dataPath = dataPath;
    this._cache = null;
    this._cachedMtimeMs = 0;
  }

  async _loadData() {
    const fileStats = await stat(this.dataPath);
    if (this._cache && fileStats.mtimeMs === this._cachedMtimeMs) {
      return this._cache;
    }

    const raw = await readFile(this.dataPath, 'utf-8');
    const parsed = JSON.parse(raw);

    const tracksById = new Map(
      (parsed.event?.tracks ?? []).map((track) => [track.id, track])
    );
    const speakersById = new Map(
      (parsed.speakers ?? []).map((speaker) => [speaker.id, speaker])
    );

    const hydratedSessions = (parsed.sessions ?? [])
      .map((session) => ({
        ...session,
        trackMeta: tracksById.get(session.track) ?? {
          id: session.track,
          name: session.track,
          color: '#5f6368',
        },
        speakers: (session.speakerIds ?? [])
          .map((id) => speakersById.get(id))
          .filter(Boolean),
      }))
      .sort((a, b) => {
        const timeCmp = a.startTime.localeCompare(b.startTime);
        if (timeCmp !== 0) return timeCmp;
        const endCmp = a.endTime.localeCompare(b.endTime);
        if (endCmp !== 0) return endCmp;
        return a.room.localeCompare(b.room);
      });

    const sessionsBySpeakerId = new Map();
    for (const session of hydratedSessions) {
      for (const speaker of session.speakers) {
        if (!sessionsBySpeakerId.has(speaker.id)) {
          sessionsBySpeakerId.set(speaker.id, []);
        }
        sessionsBySpeakerId.get(speaker.id).push({
          id: session.id,
          title: session.title,
          startTime: session.startTime,
          endTime: session.endTime,
          track: session.track,
          trackMeta: session.trackMeta,
          room: session.room,
          level: session.level,
          type: session.type,
        });
      }
    }

    const hydratedSpeakers = (parsed.speakers ?? [])
      .map((speaker) => ({
        ...speaker,
        sessions: sessionsBySpeakerId.get(speaker.id) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const levels = Array.from(
      new Set(hydratedSessions.map((s) => s.level).filter(Boolean))
    );

    const rooms =
      parsed.event?.rooms?.length > 0
        ? parsed.event.rooms
        : Array.from(new Set(hydratedSessions.map((s) => s.room).filter(Boolean)));

    this._cache = {
      event: parsed.event ?? {},
      tracks: parsed.event?.tracks ?? [],
      rooms,
      levels,
      sessions: hydratedSessions,
      speakers: hydratedSpeakers,
      sessionsById: new Map(hydratedSessions.map((s) => [s.id, s])),
      speakersById: new Map(hydratedSpeakers.map((s) => [s.id, s])),
    };
    this._cachedMtimeMs = fileStats.mtimeMs;

    return this._cache;
  }

  async getEventOverview() {
    const data = await this._loadData();
    return {
      ...data.event,
      rooms: data.rooms,
      levels: data.levels,
      stats: {
        totalSessions: data.sessions.length,
        totalSpeakers: data.speakers.length,
        totalTracks: data.tracks.length,
        totalRooms: data.rooms.length,
      },
    };
  }

  async getSchedule(filters = {}) {
    const data = await this._loadData();
    const { track, room, level, speaker, q, ids } = filters;

    const idSet = ids
      ? new Set(
          String(ids)
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        )
      : null;

    const query = q ? String(q).trim().toLowerCase() : '';
    const trackFilter = track ? String(track).trim().toLowerCase() : '';
    const roomFilter = room ? String(room).trim().toLowerCase() : '';
    const levelFilter = level ? String(level).trim().toLowerCase() : '';
    const speakerFilter = speaker ? String(speaker).trim().toLowerCase() : '';

    return data.sessions.filter((session) => {
      if (idSet && !idSet.has(session.id)) return false;

      if (trackFilter && session.track.toLowerCase() !== trackFilter) {
        return false;
      }

      if (roomFilter && session.room.toLowerCase() !== roomFilter) {
        return false;
      }

      if (levelFilter && session.level.toLowerCase() !== levelFilter) {
        return false;
      }

      if (speakerFilter) {
        const hasSpeaker = session.speakers.some(
          (sp) =>
            sp.id.toLowerCase() === speakerFilter ||
            sp.name.toLowerCase().includes(speakerFilter)
        );
        if (!hasSpeaker) return false;
      }

      if (query) {
        const haystack = [
          session.title,
          session.description,
          session.room,
          session.type,
          session.level,
          session.trackMeta?.name ?? '',
          ...(session.tags ?? []),
          ...session.speakers.map((sp) => `${sp.name} ${sp.company} ${sp.role}`),
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }

  async getSessionById(id) {
    const data = await this._loadData();
    return data.sessionsById.get(id) ?? null;
  }

  async getSpeakers(filters = {}) {
    const data = await this._loadData();
    const query = filters.q ? String(filters.q).trim().toLowerCase() : '';
    const trackFilter = filters.track
      ? String(filters.track).trim().toLowerCase()
      : '';

    return data.speakers.filter((speaker) => {
      if (trackFilter) {
        const matchesTrack = speaker.sessions.some(
          (s) => s.track.toLowerCase() === trackFilter
        );
        if (!matchesTrack) return false;
      }

      if (query) {
        const haystack = [
          speaker.name,
          speaker.role,
          speaker.company,
          speaker.bio,
          ...speaker.sessions.map((s) => `${s.title} ${s.trackMeta?.name ?? ''}`),
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }

  async getSpeakerById(id) {
    const data = await this._loadData();
    return data.speakersById.get(id) ?? null;
  }
}
