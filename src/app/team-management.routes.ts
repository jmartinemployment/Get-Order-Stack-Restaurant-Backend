import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// --- Zod Schemas ---

const jobSchema = z.object({
  jobTitle: z.string().min(1),
  hourlyRate: z.number().min(0),
  isTipEligible: z.boolean(),
  isPrimary: z.boolean(),
  overtimeEligible: z.boolean(),
});

const createTeamMemberSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  passcode: z.string().optional(),
  permissionSetId: z.string().uuid().optional(),
  assignedLocationIds: z.array(z.string()).optional(),
  hireDate: z.string().optional(),
  jobs: z.array(jobSchema),
});

const updateTeamMemberSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  passcode: z.string().nullable().optional(),
  permissionSetId: z.string().uuid().nullable().optional(),
  assignedLocationIds: z.array(z.string()).optional(),
  hireDate: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
});

const createPermissionSetSchema = z.object({
  name: z.string().min(1),
  permissions: z.record(z.string(), z.boolean()),
  isDefault: z.boolean().optional(),
});

const updatePermissionSetSchema = z.object({
  name: z.string().min(1).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  isDefault: z.boolean().optional(),
});

// --- Team Member helpers ---

function formatTeamMember(member: {
  id: string;
  restaurantId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  passcode: string | null;
  permissionSetId: string | null;
  assignedLocationIds: unknown;
  avatarUrl: string | null;
  hireDate: Date | null;
  status: string;
  createdAt: Date;
  permissionSet: { name: string } | null;
  jobs: {
    id: string;
    teamMemberId: string;
    jobTitle: string;
    hourlyRate: number;
    isTipEligible: boolean;
    isPrimary: boolean;
    overtimeEligible: boolean;
  }[];
}) {
  return {
    id: member.id,
    restaurantId: member.restaurantId,
    displayName: member.displayName,
    email: member.email,
    phone: member.phone,
    passcode: member.passcode,
    jobs: member.jobs,
    permissionSetId: member.permissionSetId,
    permissionSetName: member.permissionSet?.name ?? null,
    assignedLocationIds: member.assignedLocationIds as string[],
    avatarUrl: member.avatarUrl,
    hireDate: member.hireDate?.toISOString() ?? null,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
  };
}

// ============ Team Members ============

router.get('/:restaurantId/team-members', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const members = await prisma.teamMember.findMany({
      where: { restaurantId },
      include: { jobs: true, permissionSet: { select: { name: true } } },
      orderBy: { displayName: 'asc' },
    });
    res.json(members.map(formatTeamMember));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting team members:', message);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

router.post('/:restaurantId/team-members', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { displayName, email, phone, passcode, permissionSetId, assignedLocationIds, hireDate, jobs } = parsed.data;
    const member = await prisma.teamMember.create({
      data: {
        restaurantId,
        displayName,
        email: email ?? null,
        phone: phone ?? null,
        passcode: passcode ?? null,
        permissionSetId: permissionSetId ?? null,
        assignedLocationIds: assignedLocationIds ?? [],
        hireDate: hireDate ? new Date(hireDate) : null,
        jobs: { create: jobs },
      },
      include: { jobs: true, permissionSet: { select: { name: true } } },
    });
    res.status(201).json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating team member:', message);
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

router.patch('/:restaurantId/team-members/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const data: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.displayName !== undefined) data.displayName = d.displayName;
    if (d.email !== undefined) data.email = d.email;
    if (d.phone !== undefined) data.phone = d.phone;
    if (d.passcode !== undefined) data.passcode = d.passcode;
    if (d.permissionSetId !== undefined) data.permissionSetId = d.permissionSetId;
    if (d.assignedLocationIds !== undefined) data.assignedLocationIds = d.assignedLocationIds;
    if (d.hireDate !== undefined) data.hireDate = d.hireDate ? new Date(d.hireDate) : null;
    if (d.status !== undefined) data.status = d.status;

    const member = await prisma.teamMember.update({
      where: { id },
      data,
      include: { jobs: true, permissionSet: { select: { name: true } } },
    });
    res.json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating team member:', message);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

router.delete('/:restaurantId/team-members/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.teamMember.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error deleting team member:', message);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// --- Team Member Jobs ---

router.post('/:restaurantId/team-members/:memberId/jobs', async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    const parsed = jobSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    await prisma.teamMemberJob.create({
      data: { teamMemberId: memberId, ...parsed.data },
    });
    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      include: { jobs: true, permissionSet: { select: { name: true } } },
    });
    if (!member) {
      res.status(404).json({ error: 'Team member not found' });
      return;
    }
    res.status(201).json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error adding job:', message);
    res.status(500).json({ error: 'Failed to add job' });
  }
});

router.patch('/:restaurantId/team-members/:memberId/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const parsed = jobSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    await prisma.teamMemberJob.update({
      where: { id: jobId },
      data: parsed.data,
    });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating job:', message);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// ============ Permission Sets ============

router.get('/:restaurantId/permission-sets', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const sets = await prisma.permissionSet.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(sets);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting permission sets:', message);
    res.status(500).json({ error: 'Failed to get permission sets' });
  }
});

router.post('/:restaurantId/permission-sets', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const parsed = createPermissionSetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { name, permissions, isDefault } = parsed.data;
    const set = await prisma.permissionSet.create({
      data: {
        restaurant: { connect: { id: restaurantId } },
        name,
        permissions,
        isDefault: isDefault ?? false,
      },
    });
    res.status(201).json(set);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating permission set:', message);
    res.status(500).json({ error: 'Failed to create permission set' });
  }
});

router.patch('/:restaurantId/permission-sets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updatePermissionSetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.permissions !== undefined) updateData.permissions = parsed.data.permissions;
    if (parsed.data.isDefault !== undefined) updateData.isDefault = parsed.data.isDefault;
    const set = await prisma.permissionSet.update({
      where: { id },
      data: updateData,
    });
    res.json(set);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating permission set:', message);
    res.status(500).json({ error: 'Failed to update permission set' });
  }
});

router.delete('/:restaurantId/permission-sets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.permissionSet.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error deleting permission set:', message);
    res.status(500).json({ error: 'Failed to delete permission set' });
  }
});

export default router;
