import { prisma } from '@/lib/db';
import { getConnector } from './connectors';
import type { AdPlatform } from './types';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getCurrentDay(): string {
  return DAYS[new Date().getDay()];
}

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function isTimeInRange(current: string, start: string, end: string): boolean {
  return current >= start && current < end;
}

export async function evaluateSchedules() {
  console.log('[ScheduleEngine] Evaluando schedules...');

  const now = new Date();
  const currentDay = getCurrentDay();
  const currentTime = getCurrentTime();

  const schedules = await prisma.adSchedule.findMany({
    where: { enabled: true },
    include: {
      campaign: {
        include: {
          platform: { select: { id: true, platform: true, accessToken: true } },
        },
      },
    },
  });

  for (const schedule of schedules) {
    try {
      const days = schedule.daysOfWeek as string[];
      if (!days.includes(currentDay)) continue;

      const inRange = isTimeInRange(currentTime, schedule.startTime, schedule.endTime);

      const connector = getConnector(schedule.campaign.platform.platform as AdPlatform);

      let shouldAct = false;
      let newAction = '';

      if (schedule.action === 'ACTIVATE' && inRange && schedule.campaign.status === 'PAUSED') {
        shouldAct = true;
        newAction = 'ACTIVATE';
        await connector.resumeCampaign(schedule.campaign.id, schedule.campaign.externalId || '');
        await prisma.adCampaign.update({ where: { id: schedule.campaign.id }, data: { status: 'ACTIVE' } });
      } else if (schedule.action === 'PAUSE' && inRange && schedule.campaign.status === 'ACTIVE') {
        shouldAct = true;
        newAction = 'PAUSE';
        await connector.pauseCampaign(schedule.campaign.id, schedule.campaign.externalId || '');
        await prisma.adCampaign.update({ where: { id: schedule.campaign.id }, data: { status: 'PAUSED' } });
      }

      if (shouldAct) {
        await prisma.adSchedule.update({
          where: { id: schedule.id },
          data: { lastTriggeredAt: now },
        });
        console.log(`[ScheduleEngine] ${newAction} campaña ${schedule.campaign.name} (schedule: ${schedule.name})`);
      }
    } catch (err) {
      console.error(`[ScheduleEngine] Error evaluando schedule ${schedule.id}:`, err);
    }
  }

  console.log('[ScheduleEngine] Evaluación completada');
}
