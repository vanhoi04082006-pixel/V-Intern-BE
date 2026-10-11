import { BadRequestException } from '@nestjs/common';
export function sprintDates(start: string, end: string, offset: number, duration: number) {
  const startDate = new Date(new Date(start).getTime() + offset * 86400000);
  const endDate = new Date(startDate.getTime() + duration * 86400000);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(new Date(end).getTime()) || endDate > new Date(end)) throw new BadRequestException('All template sprints must fit within the session dates.');
  return { startDate, endDate };
}
