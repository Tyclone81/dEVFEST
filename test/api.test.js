import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

describe('DevFest Kisumu 2026 Schedule API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('GET /api/health returns ok status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'devfest-kisumu-2026-schedule');
  });

  it('GET /api/event returns DevFest Kisumu 2026 metadata and stats', async () => {
    const res = await fetch(`${baseUrl}/api/event`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.name, 'DevFest Kisumu 2026');
    assert.equal(body.organizer, 'GDG Kisumu');
    assert.ok(Array.isArray(body.tracks) && body.tracks.length >= 5);
    assert.ok(Array.isArray(body.rooms) && body.rooms.length >= 3);
    assert.ok(body.stats.totalSessions >= 10);
    assert.ok(body.stats.totalSpeakers >= 8);
  });

  it('GET /api/schedule returns chronologically sorted hydrated sessions', async () => {
    const res = await fetch(`${baseUrl}/api/schedule`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.count, body.sessions.length);
    assert.ok(body.sessions.length >= 10);

    // Verify chronological ordering by startTime
    for (let i = 1; i < body.sessions.length; i += 1) {
      assert.ok(
        body.sessions[i - 1].startTime <= body.sessions[i].startTime,
        `Expected ${body.sessions[i - 1].startTime} <= ${body.sessions[i].startTime}`
      );
    }

    // Verify speaker hydration on a session with speakers
    const keynote = body.sessions.find((s) => s.id === 'ses-03');
    assert.ok(keynote);
    assert.equal(keynote.speakers.length, 1);
    assert.equal(keynote.speakers[0].name, 'Dr. Amina Ochieng');
    assert.equal(keynote.trackMeta.name, 'Keynote');
  });

  it('GET /api/schedule filters by track, room, level, speaker, ids, and search query', async () => {
    // Filter by track
    const aiRes = await fetch(`${baseUrl}/api/schedule?track=ai-ml`);
    const aiBody = await aiRes.json();
    assert.ok(aiBody.count > 0);
    assert.ok(aiBody.sessions.every((s) => s.track === 'ai-ml'));

    // Filter by room
    const roomRes = await fetch(
      `${baseUrl}/api/schedule?room=${encodeURIComponent('Dunga Lab')}`
    );
    const roomBody = await roomRes.json();
    assert.ok(roomBody.count > 0);
    assert.ok(roomBody.sessions.every((s) => s.room === 'Dunga Lab'));

    // Filter by level
    const levelRes = await fetch(`${baseUrl}/api/schedule?level=Advanced`);
    const levelBody = await levelRes.json();
    assert.ok(levelBody.count > 0);
    assert.ok(levelBody.sessions.every((s) => s.level === 'Advanced'));

    // Filter by speaker ID
    const spkRes = await fetch(`${baseUrl}/api/schedule?speaker=spk-03`);
    const spkBody = await spkRes.json();
    assert.ok(spkBody.count >= 2);
    assert.ok(
      spkBody.sessions.every((s) => s.speakers.some((sp) => sp.id === 'spk-03'))
    );

    // Filter by explicit comma-separated IDs (My Schedule)
    const idsRes = await fetch(`${baseUrl}/api/schedule?ids=ses-03,ses-07`);
    const idsBody = await idsRes.json();
    assert.equal(idsBody.count, 2);
    assert.deepEqual(
      idsBody.sessions.map((s) => s.id),
      ['ses-03', 'ses-07']
    );

    // Free-text search query
    const qRes = await fetch(`${baseUrl}/api/schedule?q=flutter`);
    const qBody = await qRes.json();
    assert.ok(qBody.count >= 1);
    assert.ok(
      qBody.sessions.some((s) => s.title.toLowerCase().includes('flutter'))
    );
  });

  it('GET /api/schedule/:id returns a single session or 404', async () => {
    const okRes = await fetch(`${baseUrl}/api/schedule/ses-07`);
    assert.equal(okRes.status, 200);
    const session = await okRes.json();
    assert.equal(session.id, 'ses-07');
    assert.equal(session.speakers.length, 2);

    const missingRes = await fetch(`${baseUrl}/api/schedule/ses-does-not-exist`);
    assert.equal(missingRes.status, 404);
    const errBody = await missingRes.json();
    assert.equal(errBody.error, 'Session not found');
  });

  it('GET /api/speakers returns hydrated speakers with their sessions and supports filtering', async () => {
    const res = await fetch(`${baseUrl}/api/speakers`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.count, body.speakers.length);
    assert.ok(body.speakers.length >= 10);
    assert.ok(
      body.speakers.every(
        (sp) => Array.isArray(sp.sessions) && sp.sessions.length > 0
      )
    );

    const filteredRes = await fetch(`${baseUrl}/api/speakers?track=mobile`);
    const filteredBody = await filteredRes.json();
    assert.ok(filteredBody.count >= 2);
    assert.ok(
      filteredBody.speakers.every((sp) =>
        sp.sessions.some((s) => s.track === 'mobile')
      )
    );
  });

  it('GET /api/speakers/:id returns speaker details or 404', async () => {
    const okRes = await fetch(`${baseUrl}/api/speakers/spk-01`);
    assert.equal(okRes.status, 200);
    const speaker = await okRes.json();
    assert.equal(speaker.name, 'Dr. Amina Ochieng');
    assert.ok(speaker.sessions.length >= 2);

    const missingRes = await fetch(`${baseUrl}/api/speakers/spk-999`);
    assert.equal(missingRes.status, 404);
  });

  it('returns 404 JSON for unknown /api routes and serves HTML for /', async () => {
    const api404 = await fetch(`${baseUrl}/api/unknown-endpoint`);
    assert.equal(api404.status, 404);
    const errBody = await api404.json();
    assert.equal(errBody.error, 'API endpoint not found');

    const homeRes = await fetch(`${baseUrl}/`);
    assert.equal(homeRes.status, 200);
    const html = await homeRes.text();
    assert.ok(html.includes('DevFest Kisumu 2026'));
  });
});
