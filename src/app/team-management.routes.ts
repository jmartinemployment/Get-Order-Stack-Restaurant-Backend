import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { DEFAULT_PERMISSION_SETS, LEGACY_SET_RENAME } from '../data/default-permission-sets';

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
  password: z.string().min(6).optional(),
  tempPasswordExpiresInHours: z.number().min(1).max(168).optional(), // 1hr to 7 days
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
  password: z.string().min(6).nullable().optional(),
  tempPasswordExpiresInHours: z.number().min(1).max(168).optional(),
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

const updateOnboardingStepSchema = z.object({
  isComplete: z.boolean(),
  notes: z.string().optional(),
});

// --- Onboarding step definitions ---
const ONBOARDING_STEPS = ['personal_info', 'tax_forms', 'direct_deposit', 'documents', 'training'] as const;

const ONBOARDING_STEP_LABELS: Record<string, string> = {
  personal_info: 'Personal Information',
  tax_forms: 'Tax Forms (W-4 / W-9)',
  direct_deposit: 'Direct Deposit',
  documents: 'Documents & ID Verification',
  training: 'Training & Acknowledgements',
};

// --- Team Member helpers ---

const teamMemberInclude = {
  jobs: true,
  permissionSet: { select: { name: true } },
  staffPin: { select: { id: true } },
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
  onboardingStatus: string;
  createdAt: Date;
  permissionSet: { name: string } | null;
  staffPin?: { id: string } | null;
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
    onboardingStatus: member.onboardingStatus,
    createdAt: member.createdAt.toISOString(),
    staffPinId: member.staffPin?.id ?? null,
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting team members:', message);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

router.post('/:merchantId/team-members', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const parsed = createTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { displayName, email, phone, passcode, password, tempPasswordExpiresInHours, permissionSetId, assignedLocationIds, hireDate, jobs } = parsed.data;

    const hashedPin = passcode ? await authService.hashPin(passcode) : await authService.hashPin('0000');

    // Hash password if provided (for dashboard login)
    const passwordHash = password ? await authService.hashPassword(password) : undefined;

    // Calculate temp password expiry (default 4 hours if password provided)
    let tempPasswordExpiresAt: Date | undefined;
    let tempPasswordSetBy: string | undefined;
    if (password) {
      const hours = tempPasswordExpiresInHours ?? 4;
      tempPasswordExpiresAt = new Date();
      tempPasswordExpiresAt.setHours(tempPasswordExpiresAt.getHours() + hours);

      // Extract manager's ID from auth token if available
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const payload = authService.verifyToken(token);
        if (payload) {
          tempPasswordSetBy = payload.teamMemberId;
        }
      }
    }

    const member = await prisma.$transaction(async (tx) => {
      const tm = await tx.teamMember.create({
        data: {
          restaurantId,
          displayName,
          email: email?.toLowerCase() ?? null,
          phone: phone ?? null,
          passcode: passcode ?? null,
          passwordHash: passwordHash ?? null,
          permissionSetId: permissionSetId ?? null,
          assignedLocationIds: assignedLocationIds ?? [],
          hireDate: hireDate ? new Date(hireDate) : null,
          onboardingStatus: password ? 'not_started' : 'complete',
          tempPasswordExpiresAt: tempPasswordExpiresAt ?? null,
          tempPasswordSetBy: tempPasswordSetBy ?? null,
          jobs: { create: jobs },
        },
        include: teamMemberInclude,
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

      return tx.teamMember.findUniqueOrThrow({
        where: { id: tm.id },
        include: teamMemberInclude,
      });
    });

    res.status(201).json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating team member:', message);
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

router.patch('/:merchantId/team-members/:id', async (req: Request, res: Response) => {
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
    if (d.email !== undefined) data.email = d.email?.toLowerCase() ?? null;
    if (d.phone !== undefined) data.phone = d.phone;
    if (d.passcode !== undefined) data.passcode = d.passcode;
    if (d.permissionSetId !== undefined) data.permissionSetId = d.permissionSetId;
    if (d.assignedLocationIds !== undefined) data.assignedLocationIds = d.assignedLocationIds;
    if (d.hireDate !== undefined) data.hireDate = d.hireDate ? new Date(d.hireDate) : null;
    if (d.status !== undefined) data.status = d.status;

    // Handle password reset (manager resetting temp password)
    if (d.password !== undefined) {
      if (d.password === null) {
        data.passwordHash = null;
        data.tempPasswordExpiresAt = null;
        data.tempPasswordSetBy = null;
      } else {
        data.passwordHash = await authService.hashPassword(d.password);
        const hours = d.tempPasswordExpiresInHours ?? 4;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + hours);
        data.tempPasswordExpiresAt = expiresAt;
        data.onboardingStatus = 'not_started';

        const authHeader = req.headers.authorization;
        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          const payload = authService.verifyToken(token);
          if (payload) {
            data.tempPasswordSetBy = payload.teamMemberId;
          }
        }
      }
    }

    const member = await prisma.$transaction(async (tx) => {
      const tm = await tx.teamMember.update({
        where: { id },
        data,
        include: teamMemberInclude,
      });

      // Sync linked StaffPin if it exists
      const linkedPin = await tx.staffPin.findUnique({
        where: { teamMemberId: id },
      });

      if (linkedPin) {
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

      return tm;
    });

    res.json(formatTeamMember(member));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating team member:', message);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error deleting team member:', message);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error adding job:', message);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating job:', message);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// ============ Onboarding ============

// GET onboarding checklist for a team member
router.get('/:merchantId/team-members/:memberId/onboarding', async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;

    const rows = await prisma.onboardingChecklist.findMany({
      where: { teamMemberId: memberId },
      orderBy: { step: 'asc' },
    });

    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { onboardingStatus: true },
    });

    // Build complete step list (include steps that haven't been started)
    const rowMap = new Map(rows.map(r => [r.step, r]));
    const steps = ONBOARDING_STEPS.map(step => {
      const row = rowMap.get(step);
      return {
        step,
        label: ONBOARDING_STEP_LABELS[step],
        isComplete: row?.isComplete ?? false,
        completedAt: row?.completedAt?.toISOString() ?? null,
        notes: row?.notes ?? null,
      };
    });

    const allComplete = steps.every(s => s.isComplete);

    res.json({
      teamMemberId: memberId,
      onboardingStatus: member?.onboardingStatus ?? 'not_started',
      steps,
      completedAt: allComplete ? rows.find(r => r.isComplete)?.completedAt?.toISOString() ?? null : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting onboarding checklist:', message);
    res.status(500).json({ error: 'Failed to get onboarding checklist' });
  }
});

// PATCH toggle a single onboarding step
router.patch('/:merchantId/team-members/:memberId/onboarding/:step', async (req: Request, res: Response) => {
  try {
    const { memberId, step } = req.params;
    const parsed = updateOnboardingStepSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    if (!ONBOARDING_STEPS.includes(step as typeof ONBOARDING_STEPS[number])) {
      res.status(400).json({ error: `Invalid step: ${step}` });
      return;
    }

    await prisma.onboardingChecklist.upsert({
      where: {
        teamMemberId_step: { teamMemberId: memberId, step },
      },
      create: {
        teamMemberId: memberId,
        step,
        isComplete: parsed.data.isComplete,
        completedAt: parsed.data.isComplete ? new Date() : null,
        notes: parsed.data.notes ?? null,
      },
      update: {
        isComplete: parsed.data.isComplete,
        completedAt: parsed.data.isComplete ? new Date() : null,
        notes: parsed.data.notes ?? null,
      },
    });

    // Update team member onboardingStatus based on step completions
    const allSteps = await prisma.onboardingChecklist.findMany({
      where: { teamMemberId: memberId },
    });
    const completedCount = allSteps.filter(s => s.isComplete).length;
    let newStatus = 'not_started';
    if (completedCount === ONBOARDING_STEPS.length) {
      newStatus = 'complete';
    } else if (completedCount > 0) {
      newStatus = 'in_progress';
    }
    await prisma.teamMember.update({
      where: { id: memberId },
      data: { onboardingStatus: newStatus },
    });

    res.json({ success: true, onboardingStatus: newStatus });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating onboarding step:', message);
    res.status(500).json({ error: 'Failed to update onboarding step' });
  }
});

// POST complete onboarding (marks all steps done + updates status)
router.post('/:merchantId/team-members/:memberId/onboarding/complete', async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Upsert all steps as complete
      for (const step of ONBOARDING_STEPS) {
        await tx.onboardingChecklist.upsert({
          where: {
            teamMemberId_step: { teamMemberId: memberId, step },
          },
          create: {
            teamMemberId: memberId,
            step,
            isComplete: true,
            completedAt: now,
          },
          update: {
            isComplete: true,
            completedAt: now,
          },
        });
      }

      // Mark team member onboarding as complete + clear temp password
      await tx.teamMember.update({
        where: { id: memberId },
        data: {
          onboardingStatus: 'complete',
          tempPasswordExpiresAt: null,
          tempPasswordSetBy: null,
        },
      });
    });

    res.json({ success: true, onboardingStatus: 'complete' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error completing onboarding:', message);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// ============ Permission Sets ============

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

      // Rename legacy sets to new role-named equivalents
      const renamed: string[] = [];
      for (const set of existing) {
        const newName = LEGACY_SET_RENAME[set.name];
        if (newName) {
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
      }

      // Re-fetch after renames
      const updated = await tx.permissionSet.findMany({
        where: { restaurantId, isDefault: true },
        select: { name: true },
      });
      const existingNames = new Set(updated.map(e => e.name));

      // Create missing defaults
      const created: string[] = [];
      for (const def of DEFAULT_PERMISSION_SETS) {
        if (!existingNames.has(def.name)) {
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
      }

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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error seeding default permission sets:', message);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting permission sets:', message);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating permission set:', message);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating permission set:', message);
    res.status(500).json({ error: 'Failed to update permission set' });
  }
});

router.delete('/:merchantId/permission-sets/:id', async (req: Request, res: Response) => {
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

// ============ POS Login ============

router.post('/:merchantId/pos/login', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { passcode } = req.body;

    if (!passcode) {
      res.status(400).json({ error: 'Passcode is required' });
      return;
    }

    const result = await authService.posLogin(restaurantId, passcode);

    if (!result) {
      res.status(401).json({ error: 'Invalid passcode' });
      return;
    }

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('POS login error:', message);
    res.status(500).json({ error: 'POS login failed' });
  }
});

export default router;
