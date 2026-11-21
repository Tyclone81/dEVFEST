import { Router } from 'express';

/**
 * Builds the REST API router backed by ScheduleService.
 */
export function createApiRouter(scheduleService) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'devfest-kisumu-2026-schedule',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/event', async (_req, res, next) => {
    try {
      const overview = await scheduleService.getEventOverview();
      res.json(overview);
    } catch (error) {
      next(error);
    }
  });

  router.get('/schedule', async (req, res, next) => {
    try {
      const { track, room, level, speaker, q, ids } = req.query;
      const sessions = await scheduleService.getSchedule({
        track,
        room,
        level,
        speaker,
        q,
        ids,
      });

      res.json({
        count: sessions.length,
        sessions,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/schedule/:id', async (req, res, next) => {
    try {
      const session = await scheduleService.getSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          id: req.params.id,
        });
      }
      res.json(session);
    } catch (error) {
      next(error);
    }
  });

  router.get('/speakers', async (req, res, next) => {
    try {
      const { q, track } = req.query;
      const speakers = await scheduleService.getSpeakers({ q, track });
      res.json({
        count: speakers.length,
        speakers,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/speakers/:id', async (req, res, next) => {
    try {
      const speaker = await scheduleService.getSpeakerById(req.params.id);
      if (!speaker) {
        return res.status(404).json({
          error: 'Speaker not found',
          id: req.params.id,
        });
      }
      res.json(speaker);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
