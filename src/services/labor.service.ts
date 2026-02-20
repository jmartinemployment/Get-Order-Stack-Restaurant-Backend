import { PrismaClient } from '@prisma/client';
import { salesInsightsService } from './sales-insights.service';
import { aiConfigService } from './ai-config.service';
import { aiUsageService } from './ai-usage.service';

const prisma = new PrismaClient();

function shiftDurationHours(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  // Cross-midnight
  if (endMinutes <= startMinutes) {
    endMinutes += 1440;
  }
  return (endMinutes - startMinutes) / 60;
}

interface LaborRecommendation {
  type: 'overstaffed' | 'understaffed' | 'cost_optimization' | 'scheduling_tip';
  title: string;
  message: string;
  hour?: number;
  dayOfWeek?: number;
  priority: 'high' | 'medium' | 'low';
  potentialSavings?: number;
}

function generateBasicRecommendations(
  ordersByHour: Record<number, number>,
  shiftsByHour: Record<number, number>,
): LaborRecommendation[] {
  const recommendations: LaborRecommendation[] = [];

  for (const [hourStr, orders] of Object.entries(ordersByHour)) {
    const hour = Number(hourStr);
    const staffCount = shiftsByHour[hour] ?? 0;

    if (orders > 10 && staffCount < 2) {
      recommendations.push({
        type: 'understaffed',
        title: `Understaffed at ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`,
        message: `${orders} orders at ${hour}:00 with only ${staffCount} staff scheduled. Consider adding 1-2 more staff.`,
        hour,
        priority: 'high',
      });
    } else if (orders < 3 && staffCount > 3) {
      const savings = (staffCount - 2) * 15;
      recommendations.push({
        type: 'overstaffed',
        title: `Overstaffed at ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`,
        message: `Only ${orders} orders at ${hour}:00 with ${staffCount} staff scheduled. Could reduce by ${staffCount - 2} staff.`,
        hour,
        priority: 'medium',
        potentialSavings: savings,
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'scheduling_tip',
      title: 'Staffing looks balanced',
      message: 'Current staffing levels appear well-matched to order volume. Continue monitoring for changes.',
      priority: 'low',
    });
  }

  return recommendations;
}

export const laborService = {
  async getShifts(restaurantId: string, startDate: string, endDate: string) {
    const shifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        staffPin: { select: { name: true, role: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return shifts.map((s) => ({
      id: s.id,
      restaurantId: s.restaurantId,
      staffPinId: s.staffPinId,
      staffName: s.staffPin.name,
      staffRole: s.staffPin.role,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      position: s.position,
      breakMinutes: s.breakMinutes,
      notes: s.notes,
      isPublished: s.isPublished,
    }));
  },

  async createShift(restaurantId: string, data: {
    staffPinId: string;
    date: string;
    startTime: string;
    endTime: string;
    position: string;
    breakMinutes?: number;
    notes?: string;
  }) {
    // Conflict detection: check for overlapping shifts on same staff + date
    const existingShifts = await prisma.shift.findMany({
      where: {
        staffPinId: data.staffPinId,
        date: new Date(data.date),
      },
    });

    for (const existing of existingShifts) {
      if (data.startTime < existing.endTime && data.endTime > existing.startTime) {
        throw new Error(`CONFLICT: Overlapping shift for this staff member on ${data.date} (${existing.startTime}-${existing.endTime})`);
      }
    }

    const shift = await prisma.shift.create({
      data: {
        restaurantId,
        staffPinId: data.staffPinId,
        date: new Date(data.date),
        startTime: data.startTime,
        endTime: data.endTime,
        position: data.position,
        breakMinutes: data.breakMinutes ?? 0,
        notes: data.notes ?? null,
      },
      include: {
        staffPin: { select: { name: true, role: true } },
      },
    });

    return {
      id: shift.id,
      restaurantId: shift.restaurantId,
      staffPinId: shift.staffPinId,
      staffName: shift.staffPin.name,
      staffRole: shift.staffPin.role,
      date: shift.date.toISOString().split('T')[0],
      startTime: shift.startTime,
      endTime: shift.endTime,
      position: shift.position,
      breakMinutes: shift.breakMinutes,
      notes: shift.notes,
      isPublished: shift.isPublished,
    };
  },

  async updateShift(shiftId: string, data: {
    staffPinId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    position?: string;
    breakMinutes?: number;
    notes?: string;
  }) {
    const existing = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });

    const staffPinId = data.staffPinId ?? existing.staffPinId;
    const dateStr = data.date ?? existing.date.toISOString().split('T')[0];
    const startTime = data.startTime ?? existing.startTime;
    const endTime = data.endTime ?? existing.endTime;

    // Conflict detection excluding self
    const otherShifts = await prisma.shift.findMany({
      where: {
        staffPinId,
        date: new Date(dateStr),
        id: { not: shiftId },
      },
    });

    for (const other of otherShifts) {
      if (startTime < other.endTime && endTime > other.startTime) {
        throw new Error(`CONFLICT: Overlapping shift for this staff member on ${dateStr} (${other.startTime}-${other.endTime})`);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.staffPinId !== undefined) updateData.staffPinId = data.staffPinId;
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (data.startTime !== undefined) updateData.startTime = data.startTime;
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.breakMinutes !== undefined) updateData.breakMinutes = data.breakMinutes;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const shift = await prisma.shift.update({
      where: { id: shiftId },
      data: updateData,
      include: {
        staffPin: { select: { name: true, role: true } },
      },
    });

    return {
      id: shift.id,
      restaurantId: shift.restaurantId,
      staffPinId: shift.staffPinId,
      staffName: shift.staffPin.name,
      staffRole: shift.staffPin.role,
      date: shift.date.toISOString().split('T')[0],
      startTime: shift.startTime,
      endTime: shift.endTime,
      position: shift.position,
      breakMinutes: shift.breakMinutes,
      notes: shift.notes,
      isPublished: shift.isPublished,
    };
  },

  async deleteShift(shiftId: string) {
    await prisma.shift.delete({ where: { id: shiftId } });
  },

  async publishWeek(restaurantId: string, weekStartDate: string) {
    const start = new Date(weekStartDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const result = await prisma.shift.updateMany({
      where: {
        restaurantId,
        date: { gte: start, lte: end },
      },
      data: { isPublished: true },
    });

    return { count: result.count };
  },

  async clockIn(restaurantId: string, staffPinId: string, shiftId?: string) {
    // Check no open clock for this staff
    const openClock = await prisma.timeEntry.findFirst({
      where: {
        restaurantId,
        staffPinId,
        clockOut: null,
      },
    });

    if (openClock) {
      throw new Error('ALREADY_CLOCKED_IN: Staff member is already clocked in');
    }

    const entry = await prisma.timeEntry.create({
      data: {
        restaurantId,
        staffPinId,
        shiftId: shiftId ?? null,
        clockIn: new Date(),
      },
      include: {
        staffPin: { select: { name: true, role: true } },
      },
    });

    return {
      id: entry.id,
      staffPinId: entry.staffPinId,
      staffName: entry.staffPin.name,
      staffRole: entry.staffPin.role,
      shiftId: entry.shiftId,
      clockIn: entry.clockIn.toISOString(),
      clockOut: null,
      breakMinutes: entry.breakMinutes,
      hoursWorked: 0,
    };
  },

  async clockOut(timeEntryId: string, breakMinutes?: number, notes?: string) {
    const updateData: Record<string, unknown> = {
      clockOut: new Date(),
    };
    if (breakMinutes !== undefined) updateData.breakMinutes = breakMinutes;
    if (notes !== undefined) updateData.notes = notes;

    const entry = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: updateData,
      include: {
        staffPin: { select: { name: true, role: true } },
      },
    });

    const clockInMs = entry.clockIn.getTime();
    const clockOutMs = entry.clockOut!.getTime();
    const hoursWorked = Math.max(0, (clockOutMs - clockInMs) / 3600000 - (entry.breakMinutes / 60));

    return {
      id: entry.id,
      staffPinId: entry.staffPinId,
      staffName: entry.staffPin.name,
      staffRole: entry.staffPin.role,
      shiftId: entry.shiftId,
      clockIn: entry.clockIn.toISOString(),
      clockOut: entry.clockOut!.toISOString(),
      breakMinutes: entry.breakMinutes,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
    };
  },

  async getActiveClocks(restaurantId: string) {
    const entries = await prisma.timeEntry.findMany({
      where: {
        restaurantId,
        clockOut: null,
      },
      include: {
        staffPin: { select: { name: true, role: true } },
      },
      orderBy: { clockIn: 'asc' },
    });

    return entries.map((e) => ({
      id: e.id,
      staffPinId: e.staffPinId,
      staffName: e.staffPin.name,
      staffRole: e.staffPin.role,
      shiftId: e.shiftId,
      clockIn: e.clockIn.toISOString(),
      clockOut: null,
      breakMinutes: e.breakMinutes,
      hoursWorked: 0,
    }));
  },

  async getLaborReport(restaurantId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const entries = await prisma.timeEntry.findMany({
      where: {
        restaurantId,
        clockIn: { gte: start },
        clockOut: { lte: end, not: null },
      },
      include: {
        staffPin: { select: { id: true, name: true, role: true } },
      },
    });

    const hourlyRate = 15;

    // Staff summaries
    const staffMap = new Map<string, {
      staffPinId: string;
      staffName: string;
      staffRole: string;
      totalHours: number;
      shiftsWorked: number;
    }>();

    for (const entry of entries) {
      const hours = Math.max(0, (entry.clockOut!.getTime() - entry.clockIn.getTime()) / 3600000 - (entry.breakMinutes / 60));

      const existing = staffMap.get(entry.staffPinId);
      if (existing) {
        existing.totalHours += hours;
        existing.shiftsWorked += 1;
      } else {
        staffMap.set(entry.staffPinId, {
          staffPinId: entry.staffPinId,
          staffName: entry.staffPin.name,
          staffRole: entry.staffPin.role,
          totalHours: hours,
          shiftsWorked: 1,
        });
      }
    }

    const staffSummaries = [...staffMap.values()].map((s) => {
      const regularHours = Math.min(s.totalHours, 40);
      const overtimeHours = Math.max(0, s.totalHours - 40);
      return {
        staffPinId: s.staffPinId,
        staffName: s.staffName,
        staffRole: s.staffRole,
        totalHours: Math.round(s.totalHours * 100) / 100,
        regularHours: Math.round(regularHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        laborCost: Math.round((regularHours * hourlyRate + overtimeHours * hourlyRate * 1.5) * 100) / 100,
        shiftsWorked: s.shiftsWorked,
      };
    });

    const totalHours = staffSummaries.reduce((sum, s) => sum + s.totalHours, 0);
    const totalLaborCost = staffSummaries.reduce((sum, s) => sum + s.laborCost, 0);

    // Revenue from sales insights
    let totalRevenue = 0;
    try {
      const summary = await salesInsightsService.getSalesSummary(restaurantId, start, end);
      totalRevenue = summary.totalRevenue;
    } catch {
      // If sales data unavailable, revenue stays 0
    }

    const laborPercent = totalRevenue > 0 ? Math.round((totalLaborCost / totalRevenue) * 10000) / 100 : 0;

    // Daily breakdown
    const dayMap = new Map<string, { hours: number; cost: number }>();
    for (const entry of entries) {
      const dateKey = entry.clockIn.toISOString().split('T')[0];
      const hours = Math.max(0, (entry.clockOut!.getTime() - entry.clockIn.getTime()) / 3600000 - (entry.breakMinutes / 60));
      const cost = hours * hourlyRate;

      const existing = dayMap.get(dateKey);
      if (existing) {
        existing.hours += hours;
        existing.cost += cost;
      } else {
        dayMap.set(dateKey, { hours, cost });
      }
    }

    // Load targets for target overlay
    const targets = await prisma.laborTarget.findMany({ where: { restaurantId } });
    const targetMap = new Map(targets.map((t) => [t.dayOfWeek, Number(t.targetPercent)]));

    const dailyBreakdown = [...dayMap.entries()].map(([date, data]) => {
      const dayOfWeek = new Date(date).getDay();
      return {
        date,
        hours: Math.round(data.hours * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
        revenue: 0, // Would need per-day revenue query
        laborPercent: 0,
        targetPercent: targetMap.get(dayOfWeek) ?? null,
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    // Overtime flags
    const overtimeFlags = staffSummaries
      .filter((s) => s.overtimeHours > 0)
      .map((s) => ({
        staffPinId: s.staffPinId,
        staffName: s.staffName,
        weeklyHours: s.totalHours,
        overtimeHours: s.overtimeHours,
      }));

    return {
      startDate: startDate,
      endDate: endDate,
      totalHours: Math.round(totalHours * 100) / 100,
      totalLaborCost: Math.round(totalLaborCost * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      laborPercent,
      staffSummaries,
      dailyBreakdown,
      overtimeFlags,
    };
  },

  async getLaborRecommendations(restaurantId: string): Promise<LaborRecommendation[]> {
    // Get current week shifts
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const shifts = await prisma.shift.findMany({
      where: {
        restaurantId,
        date: { gte: weekStart, lte: weekEnd },
      },
    });

    // Build staff-by-hour map
    const shiftsByHour: Record<number, number> = {};
    for (const shift of shifts) {
      const [startH] = shift.startTime.split(':').map(Number);
      const [endH] = shift.endTime.split(':').map(Number);
      const actualEnd = endH <= startH ? endH + 24 : endH;
      for (let h = startH; h < actualEnd; h++) {
        const normalizedHour = h % 24;
        shiftsByHour[normalizedHour] = (shiftsByHour[normalizedHour] ?? 0) + 1;
      }
    }

    // Get sales data for peak hours
    let ordersByHour: Record<number, number> = {};
    try {
      const summary = await salesInsightsService.getSalesSummary(restaurantId, weekStart, weekEnd);
      ordersByHour = summary.ordersByHour;
    } catch {
      // No sales data available
    }

    // Try AI recommendations via config gateway
    const client = await aiConfigService.getAnthropicClientForRestaurant(restaurantId, 'laborOptimization');
    if (!client) {
      return generateBasicRecommendations(ordersByHour, shiftsByHour);
    }

    try {

      const prompt = `You are a restaurant labor management advisor. Based on this staffing and sales data, provide 3-5 specific labor recommendations.

SHIFTS THIS WEEK: ${shifts.length} total shifts scheduled
STAFF BY HOUR: ${JSON.stringify(shiftsByHour)}
ORDERS BY HOUR: ${JSON.stringify(ordersByHour)}

Provide recommendations as a JSON array of objects with these fields:
- type: "overstaffed" | "understaffed" | "cost_optimization" | "scheduling_tip"
- title: short title (max 60 chars)
- message: detailed recommendation (1-2 sentences)
- hour: (optional) specific hour number if relevant
- priority: "high" | "medium" | "low"
- potentialSavings: (optional) estimated dollar savings per week

Format: [{"type":"...", "title":"...", "message":"...", "priority":"...", ...}]`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      await aiUsageService.logUsage(restaurantId, 'laborOptimization', response.usage.input_tokens, response.usage.output_tokens);

      const content = response.content[0];
      if (content.type !== 'text') {
        return generateBasicRecommendations(ordersByHour, shiftsByHour);
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return generateBasicRecommendations(ordersByHour, shiftsByHour);
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: unknown) {
      console.error('[Labor] AI recommendations failed:', error);
      return generateBasicRecommendations(ordersByHour, shiftsByHour);
    }
  },

  async getTargets(restaurantId: string) {
    const targets = await prisma.laborTarget.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return targets.map((t) => ({
      id: t.id,
      dayOfWeek: t.dayOfWeek,
      targetPercent: Number(t.targetPercent),
      targetCost: t.targetCost !== null ? Number(t.targetCost) : null,
    }));
  },

  async setTarget(restaurantId: string, data: { dayOfWeek: number; targetPercent: number; targetCost?: number }) {
    const target = await prisma.laborTarget.upsert({
      where: {
        restaurantId_dayOfWeek: {
          restaurantId,
          dayOfWeek: data.dayOfWeek,
        },
      },
      create: {
        restaurantId,
        dayOfWeek: data.dayOfWeek,
        targetPercent: data.targetPercent,
        targetCost: data.targetCost ?? null,
      },
      update: {
        targetPercent: data.targetPercent,
        targetCost: data.targetCost ?? null,
      },
    });

    return {
      id: target.id,
      dayOfWeek: target.dayOfWeek,
      targetPercent: Number(target.targetPercent),
      targetCost: target.targetCost !== null ? Number(target.targetCost) : null,
    };
  },
};
