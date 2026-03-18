import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { DEFAULT_PERMISSION_SETS, LEGACY_SET_RENAME } from '../data/default-permission-sets';
import { toErrorMessage } from '../utils/errors';
import { logger } from '../utils/logger';

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

const taxInfoSchema = z.object({
  filingStatus: z.enum(['single', 'married_jointly', 'married_separately', 'head_of_household', 'qualifying_widow']),
  multipleJobs: z.boolean(),
  qualifyingChildrenAmount: z.number().min(0),
  otherDependentsAmount: z.number().min(0),
  otherIncome: z.number().min(0),
  deductions: z.number().min(0),
  extraWithholding: z.number().min(0),
  state: z.string().min(2).max(2),
});

const createTeamMemberSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  passcode: z.string().optional(),
  password: z.string().min(6).optional(),
  tempPasswordExpiresInHours: z.number().min(1).max(168).optional(), // 1hr to 7 days
  permissionSetId: z.string().uuid().optional(),
  assignedLocationIds: z.array(z.string()).optional(),
  hireDate: z.string().optional(),
  jobs: z.array(jobSchema),
  taxInfo: taxInfoSchema.optional(),
});

const updateTeamMemberSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  passcode: z.string().nullable().optional(),
  password: z.string().min(6).nullable().optional(),
  tempPasswordExpiresInHours: z.number().min(1).max(168).optional(),
  permissionSetId: z.string().uuid().nullable().optional(),
  assignedLocationIds: z.array(z.string()).optional(),
  hireDate: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
  taxInfo: taxInfoSchema.nullable().optional(),
  jobs: z.array(jobSchema).optional(),
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

const teamMemberInclude = {
  jobs: true,
  permissionSet: { select: { name: true } },
  staffPin: { select: { id: true } },
  taxInfo: true,
} as const;

interface FormattableMember {
  id: string;
  restaurantId: string | null;
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
  staffPin?: { id: string } | null;
  taxInfo?: {
    id: string;
    filingStatus: string;
    multipleJobs: boolean;
    qualifyingChildrenAmount: number;
    otherDependentsAmount: number;
    otherIncome: number;
    deductions: number;
    extraWithholding: number;
    state: string;
  } | null;
  jobs: {
    id: string;
    teamMemberId: string;
    jobTitle: string;
    hourlyRate: number;
    isTipEligible: boolean;
    isPrimary: boolean;
    overtimeEligible: boolean;
  }[];
}

function formatTeamMember(member: FormattableMember) {
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
    staffPinId: member.staffPin?.id ?? null,
    taxInfo: member.taxInfo ? {
      filingStatus: member.taxInfo.filingStatus,
      multipleJobs: member.taxInfo.multipleJobs,
      qualifyingChildrenAmount: member.taxInfo.qualifyingChildrenAmount,
      otherDependentsAmount: member.taxInfo.otherDependentsAmount,
      otherIncome: member.taxInfo.otherIncome,
      deductions: member.taxInfo.deductions,
      extraWithholding: member.taxInfo.extraWithholding,
      state: member.taxInfo.state,
    } : null,
  };
}

// ============ Team Members ============

router.get('/:merchantId/team-members', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const members = await prisma.teamMember.findMany({
      where: { restaurantId },
      include: teamMemberInclude,
      orderBy: { displayName: 'asc' },
    });
    res.json(members.map(formatTeamMember));
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error getting team members:', message);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

async function buildCreatePasswordFields(
  password: string | undefined,
  expiresInHours: number | undefined,
  authHeader: string | undefined,
): Promise<{ passwordHash: string | null; tempPasswordExpiresAt: Date | null; tempPasswordSetBy: string | null }> {
  if (!password) {
    return { passwordHash: null, tempPasswordExpiresAt: null, tempPasswordSetBy: null };
  }

  const passwordHash = await authService.hashPassword(password);
  const hours = expiresInHours ?? 4;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);

  let setBy: string | null = null;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const payload = authService.verifyToken(token);
    if (payload) setBy = payload.teamMemberId;
  }

  return { passwordHash, tempPasswordExpiresAt: expiresAt, tempPasswordSetBy: setBy };
}

router.post('/:merchantId/team-members', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = createTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { displayName, email, phone, passcode, password, tempPasswordExpiresInHours, permissionSetId, assignedLocationIds, hireDate, jobs, taxInfo } = parsed.data;

    const hashedPin = await authService.hashPin(passcode ?? '0000');
    const pwFields = await buildCreatePasswordFields(password, tempPasswordExpiresInHours, req.headers.authorization);

    const member = await prisma.$transaction(async (tx) => {
      const tm = await tx.teamMember.create({
        data: {
          restaurantId,
          displayName,
          email: email?.toLowerCase() ?? null,
          phone: phone ?? null,
          passcode: passcode ?? null,
          passwordHash: pwFields.passwordHash,
          permissionSetId: permissionSetId ?? null,
          assignedLocationIds: assignedLocationIds ?? [],
          hireDate: hireDate ? new Date(hireDate) : null,
          tempPasswordExpiresAt: pwFields.tempPasswordExpiresAt,
          tempPasswordSetBy: pwFields.tempPasswordSetBy,
          jobs: { create: jobs },
        },
        select: { id: true },
      });

      await tx.staffPin.create({
        data: {
          restaurantId,
          teamMemberId: tm.id,
          pin: hashedPin,
          name: displayName,
          role: 'team_member',
        },
      });

      if (taxInfo) {
        await tx.staffTaxInfo.create({
          data: { teamMemberId: tm.id, ...taxInfo },
        });
      }

      return tx.teamMember.findUniqueOrThrow({
        where: { id: tm.id },
        include: teamMemberInclude,
      });
    });

    res.status(201).json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error creating team member:', message);
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

function buildScalarUpdates(d: UpdateTeamMemberInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (d.displayName !== undefined) data.displayName = d.displayName;
  if (d.email !== undefined) data.email = d.email?.toLowerCase() ?? null;
  if (d.phone !== undefined) data.phone = d.phone;
  if (d.passcode !== undefined) data.passcode = d.passcode;
  if (d.permissionSetId !== undefined) data.permissionSetId = d.permissionSetId;
  if (d.assignedLocationIds !== undefined) data.assignedLocationIds = d.assignedLocationIds;
  if (d.hireDate !== undefined) data.hireDate = d.hireDate ? new Date(d.hireDate) : null;
  if (d.status !== undefined) data.status = d.status;
  return data;
}

async function buildPasswordFields(
  password: string | null,
  expiresInHours: number | undefined,
  authHeader: string | undefined,
): Promise<Record<string, unknown>> {
  if (password === null) {
    return { passwordHash: null, tempPasswordExpiresAt: null, tempPasswordSetBy: null };
  }

  const data: Record<string, unknown> = {};
  data.passwordHash = await authService.hashPassword(password);
  const hours = expiresInHours ?? 4;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  data.tempPasswordExpiresAt = expiresAt;

  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const payload = authService.verifyToken(token);
    if (payload) {
      data.tempPasswordSetBy = payload.teamMemberId;
    }
  }

  return data;
}

async function syncLinkedStaffPin(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  teamMemberId: string,
  d: UpdateTeamMemberInput,
): Promise<void> {
  const linkedPin = await tx.staffPin.findUnique({
    where: { teamMemberId },
  });

  if (!linkedPin) return;

  const pinUpdate: Record<string, unknown> = {};
  if (d.displayName !== undefined) pinUpdate.name = d.displayName;
  if (d.status !== undefined) pinUpdate.isActive = d.status === 'active';
  if (d.passcode !== undefined && d.passcode !== null) {
    pinUpdate.pin = await authService.hashPin(d.passcode);
  }
  if (Object.keys(pinUpdate).length > 0) {
    await tx.staffPin.update({
      where: { id: linkedPin.id },
      data: pinUpdate,
    });
  }
}

router.patch('/:merchantId/team-members/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const d = parsed.data;
    const data = buildScalarUpdates(d);

    if (d.password !== undefined) {
      const passwordFields = await buildPasswordFields(
        d.password,
        d.tempPasswordExpiresInHours,
        req.headers.authorization,
      );
      Object.assign(data, passwordFields);
    }

    const member = await prisma.$transaction(async (tx) => {
      await tx.teamMember.update({
        where: { id },
        data,
        include: teamMemberInclude,
      });

      if (d.taxInfo !== undefined) {
        if (d.taxInfo === null) {
          await tx.staffTaxInfo.deleteMany({ where: { teamMemberId: id } });
        } else {
          await tx.staffTaxInfo.upsert({
            where: { teamMemberId: id },
            create: { teamMemberId: id, ...d.taxInfo },
            update: d.taxInfo,
          });
        }
      }

      if (d.jobs !== undefined) {
        await tx.teamMemberJob.deleteMany({ where: { teamMemberId: id } });
        if (d.jobs.length > 0) {
          await tx.teamMemberJob.createMany({
            data: d.jobs.map(j => ({ teamMemberId: id, ...j })),
          });
        }
      }

      await syncLinkedStaffPin(tx, id, d);

      return tx.teamMember.findUniqueOrThrow({
        where: { id },
        include: teamMemberInclude,
      });
    });

    res.json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error updating team member:', message);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

router.delete('/:merchantId/team-members/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      // Deactivate linked StaffPin and unlink (preserves shift history)
      const linkedPin = await tx.staffPin.findUnique({
        where: { teamMemberId: id },
      });
      if (linkedPin) {
        await tx.staffPin.update({
          where: { id: linkedPin.id },
          data: { isActive: false, teamMemberId: null },
        });
      }

      await tx.teamMember.delete({ where: { id } });
    });

    res.json({ success: true });
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error deleting team member:', message);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// --- Team Member Jobs ---

router.post('/:merchantId/team-members/:memberId/jobs', async (req: Request, res: Response) => {
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
      include: teamMemberInclude,
    });
    if (!member) {
      res.status(404).json({ error: 'Team member not found' });
      return;
    }
    res.status(201).json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error adding job:', message);
    res.status(500).json({ error: 'Failed to add job' });
  }
});

router.patch('/:merchantId/team-members/:memberId/jobs/:jobId', async (req: Request, res: Response) => {
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
    const message = toErrorMessage(error);
    logger.error('Error updating job:', message);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// ============ Permission Sets ============

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function renameLegacySets(
  tx: TxClient,
  existing: Array<{ id: string; name: string }>,
): Promise<string[]> {
  const renamed: string[] = [];
  for (const set of existing) {
    const newName = LEGACY_SET_RENAME[set.name];
    if (!newName) continue;
    const targetDef = DEFAULT_PERMISSION_SETS.find(d => d.name === newName);
    await tx.permissionSet.update({
      where: { id: set.id },
      data: {
        name: newName,
        permissions: targetDef?.permissions ?? undefined,
      },
    });
    renamed.push(`${set.name} → ${newName}`);
  }
  return renamed;
}

async function createMissingDefaults(
  tx: TxClient,
  restaurantId: string,
  existingNames: Set<string>,
): Promise<string[]> {
  const created: string[] = [];
  for (const def of DEFAULT_PERMISSION_SETS) {
    if (existingNames.has(def.name)) continue;
    await tx.permissionSet.create({
      data: {
        restaurantId,
        name: def.name,
        permissions: def.permissions,
        isDefault: true,
      },
    });
    created.push(def.name);
  }
  return created;
}

// Seed default permission sets (idempotent)
// Handles migration from old 3-set model (Full Access, Standard, Limited)
// to new 6-set role-named model (Owner, Manager, Server, Cashier, Kitchen, Host)
router.post('/:merchantId/permission-sets/seed-defaults', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.permissionSet.findMany({
        where: { restaurantId, isDefault: true },
        select: { name: true, id: true },
      });

      const renamed = await renameLegacySets(tx, existing);

      const updated = await tx.permissionSet.findMany({
        where: { restaurantId, isDefault: true },
        select: { name: true },
      });
      const existingNames = new Set(updated.map(e => e.name));
      const created = await createMissingDefaults(tx, restaurantId, existingNames);

      return { created, renamed };
    });

    const allSets = await prisma.permissionSet.findMany({
      where: { restaurantId: req.params.merchantId },
      orderBy: { name: 'asc' },
    });

    res.json({
      seeded: result.created,
      renamed: result.renamed,
      permissionSets: allSets,
    });
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error seeding default permission sets:', message);
    res.status(500).json({ error: 'Failed to seed default permission sets' });
  }
});

router.get('/:merchantId/permission-sets', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const sets = await prisma.permissionSet.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    res.json(sets);
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error getting permission sets:', message);
    res.status(500).json({ error: 'Failed to get permission sets' });
  }
});

router.post('/:merchantId/permission-sets', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
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
    const message = toErrorMessage(error);
    logger.error('Error creating permission set:', message);
    res.status(500).json({ error: 'Failed to create permission set' });
  }
});

router.patch('/:merchantId/permission-sets/:id', async (req: Request, res: Response) => {
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
    const message = toErrorMessage(error);
    logger.error('[TeamManagement] Error updating permission set', { error: message });
    res.status(500).json({ error: 'Failed to update permission set' });
  }
});

router.delete('/:merchantId/permission-sets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.permissionSet.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('Error deleting permission set:', message);
    res.status(500).json({ error: 'Failed to delete permission set' });
  }
});

// ============ POS Login ============

router.post('/:merchantId/pos/login', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { passcode, staffPinId } = req.body;

    logger.info(`[POS Login] merchantId=${restaurantId}, staffPinId=${staffPinId}, passcode length=${passcode?.length}`);

    if (!passcode) {
      res.status(400).json({ error: 'Passcode is required' });
      return;
    }

    if (!staffPinId) {
      res.status(400).json({ error: 'Staff PIN ID is required' });
      return;
    }

    const result = await authService.posLogin(restaurantId, passcode, staffPinId);
    logger.info(`[POS Login] result=${result ? 'success' : 'null (no match)'}`);

    if (!result) {
      res.status(401).json({ error: 'Invalid passcode' });
      return;
    }

    res.json(result);
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    logger.error('POS login error:', message);
    res.status(500).json({ error: 'POS login failed' });
  }
});

export default router;
