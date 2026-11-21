import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleService } from '../src/services/scheduleService.js';

describe('ScheduleService (JSON data layer)', () => {
  const service = new ScheduleService();

  it('loads DevFest Kisumu 2026 event overview and stats', async () => {
    const overview = await service.getEventOverview();
    assert.equal(overview.name, 'DevFest Kisumu 2026');
    assert.equal(overview.organizer, 'GDG Kisumu');
    assert.equal(overview.stats.totalSessions, 16);
    assert.equal(overview.stats.totalSpeakers, 10);
    assert.equal(overview.stats.totalTracks, 6);
    assert.equal(overview.stats.totalRooms, 4);
  });

  it('returns chronologically sorted sessions with hydrated speakers and track metadata', async () => {
    const sessions = await service.getSchedule();
    assert.equal(sessions.length, 16);

    for (let i = 1; i < sessions.length; i += 1) {
      assert.ok(sessions[i - 1].startTime <= sessions[i].startTime);
    }

    const keynote = await service.getSessionById('ses-03');
    assert.ok(keynote);
    assert.equal(keynote.speakers.length, 1);
    assert.equal(keynote.speakers[0].name, 'Dr. Amina Ochieng');
    assert.equal(keynote.trackMeta.color, '#4285F4');
  });

  it('filters schedule by track, room, level, speaker, ids, and search query', async () => {
    const aiSessions = await service.getSchedule({ track: 'ai-ml' });
    assert.equal(aiSessions.length, 2);
    assert.ok(aiSessions.every((s) => s.track === 'ai-ml'));

    const labSessions = await service.getSchedule({ room: 'Dunga Lab' });
    assert.equal(labSessions.length, 3);

    const advanced = await service.getSchedule({ level: 'Advanced' });
    assert.equal(advanced.length, 2);

    const bySpeaker = await service.getSchedule({ speaker: 'spk-03' });
    assert.equal(bySpeaker.length, 2);

    const byIds = await service.getSchedule({ ids: 'ses-03,ses-07' });
    assert.deepEqual(
      byIds.map((s) => s.id),
      ['ses-03', 'ses-07']
    );

    const byQuery = await service.getSchedule({ q: 'cloud run' });
    assert.equal(byQuery.length, 1);
    assert.equal(byQuery[0].id, 'ses-07');
  });

  it('returns speakers with hydrated sessions and supports track/search filtering', async () => {
    const speakers = await service.getSpeakers();
    assert.equal(speakers.length, 10);
    assert.ok(speakers.every((sp) => sp.sessions.length > 0));

    const mobileSpeakers = await service.getSpeakers({ track: 'mobile' });
    assert.equal(mobileSpeakers.length, 2);

    const amina = await service.getSpeakerById('spk-01');
    assert.equal(amina.name, 'Dr. Amina Ochieng');
    assert.equal(amina.sessions.length, 2);
    assert.equal(await service.getSpeakerById('spk-999'), null);
  });
});
