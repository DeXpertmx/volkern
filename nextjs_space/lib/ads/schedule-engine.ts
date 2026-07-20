import { prisma } from '@/lib/db';
import { getConnector } from './connectors';
import { logger } from '@/lib/logger';
import type { AdPlatform } from './types';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getNowInTimezone(tz: string): { day: string; time: string } {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const formatter = new Intl.DateTimeFormat('en-US', opts);
  const parts = formatter.formatToParts(new Date());
  const dayMap: Record<string, string> = { Sun: 'SUN', Mon: 'MON', Tue: 'TUE', Wed: 'WED', Thu: 'THU', Fri: 'FRI', Sat: 'SAT' };
  let day = '';
  let time = '';
  for (const p of parts) {
    if (p.type === 'weekday') day = dayMap[p.value] || p.value.toUpperCase();
    if (p.type === 'hour') time = p.value;
    if (p.type === 'minute') time += ':' + p.value;
  }
  return { day, time };
}

function isTimeInRange(current: string, start: string, end: string): boolean {
  return current >= start && current < end;
}

export async function evaluateSchedules() {
  logger.info({ component: 'ScheduleEngine' }, 'Evaluando schedules...');

  const schedules = await prisma.adSchedule.findMany({
    where: { enabled: true },
    include: {
      campaign: {
        include: {
          platform: { select: { platform: true } },
        },
      },
    },
  });

  for (const schedule of schedules) {
    try {
      const tz = schedule.timezone || 'America/Mexico_City';
      const { day: currentDay, time: currentTime } = getNowInTimezone(tz);

      const days = schedule.daysOfWeek as string[];
      if (!days.includes(currentDay)) continue;

      const inRange = isTimeInRange(currentTime, schedule.startTime, schedule.endTime);

      const externalId = schedule.campaign.externalId;
      if (!externalId) {
        logger.warn({ scheduleId: schedule.id, campaignId: schedule.campaign.id }, 'Campaign sin externalId, saltando schedule');
        continue;
      }

      const connector = getConnector(schedule.campaign.platform.platform as AdPlatform);

      let shouldAct = false;
      let newAction = '';

      if (schedule.action === 'ACTIVATE' && inRange && schedule.campaign.status === 'PAUSED') {
        shouldAct = true;
        newAction = 'ACTIVATE';
        await connector.resumeCampaign(schedule.campaign.id, externalId);
        await prisma.adCampaign.update({ where: { id: schedule.campaign.id }, data: { status: 'ACTIVE' } });
      } else if (schedule.action === 'PAUSE' && inRange && schedule.campaign.status === 'ACTIVE') {
        shouldAct = true;
        newAction = 'PAUSE';
        await connector.pauseCampaign(schedule.campaign.id, externalId);
        await prisma.adCampaign.update({ where: { id: schedule.campaign.id }, data: { status: 'PAUSED' } });
      }

      if (shouldAct) {
        await prisma.adSchedule.update({
          where: { id: schedule.id },
          data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } },
        });
        logger.info({ scheduleId: schedule.id, campaignId: schedule.campaign.id, action: newAction },
          `Schedule: ${newAction} campaña ${schedule.campaign.name}`);
      }
    } catch (err) {
      logger.error({ scheduleId: schedule.id, err }, 'Error evaluando schedule');
    }
  }

  logger.info({ component: 'ScheduleEngine' }, 'Evaluación completada');
}
