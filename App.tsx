import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Egg,
  Home,
  PlusCircle,
  Wallet,
  Users,
  BarChart3,
  Settings,
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  IndianRupee,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Edit3,
  Download,
  LogOut,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Check,
  X,
  Info,
  Database,
  UserPlus,
  UserMinus,
  KeyRound,
  Copy,
  FileSpreadsheet,
  History,
  Menu,
  Flame,
  PackageCheck,
  HelpCircle,
  Lock
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

// ============================================================================
// 1. NORMALIZED DATABASE TYPES (12 POSTGRESQL TABLES)
// ============================================================================

export type MemberRole = 'admin' | 'member';
export type MemberStatus = 'active' | 'left';
export type ApprovalStatus = 'pending' | 'accepted';
export type PaymentStatusLabel = 'Not Paid' | 'Waiting for Confirmation' | 'Partially Paid' | 'Paid';
export type PaymentRecordStatus = 'Waiting for Confirmation' | 'Confirmed' | 'Rejected';
export type PredictionMode = 'schedule' | 'actual_average';
export type NotificationType =
  | 'shortage_warning'
  | 'purchase_added'
  | 'allocation_updated'
  | 'payment_submitted'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'system';

export interface Household {
  id: string;
  room_code: string;
  name: string;
  pin_code: string;
  expected_member_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  name: string;
  avatar: string;
  role: MemberRole;
  status: MemberStatus;
  default_daily_eggs: number;
  joined_at: string;
  left_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MemberSchedule {
  id: string;
  household_id: string;
  member_id: string;
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
  updated_at: string;
}

export interface HouseholdSettings {
  id: string;
  household_id: string;
  low_stock_threshold: number;
  reminder_lead_days: number;
  prediction_mode: PredictionMode;
  browser_notifications_enabled: boolean;
  updated_at: string;
}

export interface Purchase {
  id: string;
  household_id: string;
  purchased_by: string;
  purchase_date: string; // YYYY-MM-DD
  total_eggs: number;
  total_price_paise: number; // 1 INR = 100 paise
  cost_per_egg_paise: number;
  notes: string;
  allocation_status: 'pending_approval' | 'finalized';
  version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryBatch {
  id: string;
  household_id: string;
  purchase_id: string;
  initial_eggs: number;
  remaining_eggs: number;
  cost_per_egg_paise: number;
  batch_date: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseAllocation {
  id: string;
  household_id: string;
  purchase_id: string;
  member_id: string;
  allocated_eggs: number;
  allocated_amount_paise: number;
  approval_status: ApprovalStatus;
  accepted_at?: string;
  paid_amount_paise: number;
  pending_confirmation_paise: number;
  payment_status: PaymentStatusLabel;
  updated_at: string;
}

export interface ConsumptionLog {
  id: string;
  household_id: string;
  member_id: string;
  consumption_date: string; // YYYY-MM-DD
  eggs_count: number;
  fifo_cost_paise: number;
  log_type: 'consumption' | 'waste';
  description: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  household_id: string;
  purchase_id: string;
  allocation_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_paise: number;
  payment_date: string; // YYYY-MM-DD
  payment_method: string;
  note: string;
  status: PaymentRecordStatus;
  created_at: string;
  updated_at: string;
}

export interface PaymentConfirmation {
  id: string;
  household_id: string;
  payment_record_id: string;
  confirmed_by: string;
  action: 'confirmed' | 'rejected';
  reason: string;
  confirmed_at: string;
}

export interface AppNotification {
  id: string;
  household_id: string;
  target_member_id: string | null; // null = broadcast to whole room
  type: NotificationType;
  title: string;
  message: string;
  dedup_key: string;
  is_read_by: string[];
  is_active: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  household_id: string;
  actor_member_id: string;
  category: 'consumption' | 'purchase' | 'payment' | 'allocation' | 'member' | 'settings' | 'audit';
  message: string;
  created_at: string;
}

export interface EggMateDatabase {
  households: Household[];
  household_members: HouseholdMember[];
  member_schedules: MemberSchedule[];
  household_settings: HouseholdSettings[];
  purchases: Purchase[];
  inventory_batches: InventoryBatch[];
  purchase_allocations: PurchaseAllocation[];
  consumption_logs: ConsumptionLog[];
  payment_records: PaymentRecord[];
  payment_confirmations: PaymentConfirmation[];
  notifications: AppNotification[];
  activity_logs: ActivityLog[];
}

// ============================================================================
// 2. INDIAN CURRENCY (₹) & DATE (DD/MM/YYYY) UTILITIES
// ============================================================================

const STORAGE_KEY = 'eggmate_postgresql_store_v1';
const SESSION_KEY = 'eggmate_session_profile_v1';
const AVATAR_OPTIONS = ['🧑‍🍳', '🧑‍💻', '🏋️', '🎸', '🧑‍🎓', '🧑‍🔬', '🦸', '🧘', '🦊', '🐼', '🦁', '🐸'];

export function formatINR(paise: number, showDecimalsIfNonZero = true): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = absPaise / 100;
  const hasPaise = absPaise % 100 !== 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: showDecimalsIfNonZero && hasPaise ? 2 : 0,
    maximumFractionDigits: 2
  }).format(rupees);
  return `${isNegative ? '-' : ''}₹${formatted}`;
}

export function formatDateIN(isoDateStr: string | undefined | null): string {
  if (!isoDateStr) return '—';
  const clean = isoDateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return isoDateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeIN(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return formatDateIN(isoStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const hh12 = hh % 12 || 12;
    return `${dd}/${mm}/${yyyy}, ${hh12}:${min} ${ampm}`;
  } catch {
    return formatDateIN(isoStr);
  }
}

export function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function getDayName(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getUTCDay()];
}

export function getScheduleKeyForDate(isoDate: string): keyof Pick<MemberSchedule, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const keys: Array<keyof Pick<MemberSchedule, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>> = [
    'sun',
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
    'sat'
  ];
  return keys[dt.getUTCDay()];
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Deterministic paise & egg splitter so sums ALWAYS match 100%
export function computeEqualSplit(
  totalEggs: number,
  totalPricePaise: number,
  memberIds: string[]
): Array<{ memberId: string; eggs: number; amountPaise: number }> {
  const n = memberIds.length;
  if (n === 0) return [];
  const baseEggs = Math.floor(totalEggs / n);
  const remEggs = totalEggs % n;

  // First allocate eggs
  const eggShares = memberIds.map((memberId, idx) => ({
    memberId,
    eggs: baseEggs + (idx < remEggs ? 1 : 0)
  }));

  // Allocate paise proportionally to eggs (or equally if totalEggs == 0)
  if (totalEggs <= 0) {
    const basePaise = Math.floor(totalPricePaise / n);
    const remPaise = totalPricePaise - basePaise * n;
    return memberIds.map((memberId, idx) => ({
      memberId,
      eggs: 0,
      amountPaise: basePaise + (idx < remPaise ? 1 : 0)
    }));
  }

  let allocatedSum = 0;
  const rawShares = eggShares.map((item) => {
    const exact = (totalPricePaise * item.eggs) / totalEggs;
    const floored = Math.floor(exact);
    allocatedSum += floored;
    return {
      ...item,
      amountPaise: floored,
      fraction: exact - floored
    };
  });

  let remainderPaise = totalPricePaise - allocatedSum;
  // Sort indices by largest fractional remainder, then deterministic index order
  const order = rawShares
    .map((s, idx) => ({ idx, fraction: s.fraction }))
    .sort((a, b) => (b.fraction !== a.fraction ? b.fraction - a.fraction : a.idx - b.idx));

  for (let i = 0; i < remainderPaise; i++) {
    rawShares[order[i % order.length].idx].amountPaise += 1;
  }

  return rawShares.map(({ memberId, eggs, amountPaise }) => ({
    memberId,
    eggs,
    amountPaise
  }));
}

export function computeMoneyFromCustomEggs(
  totalEggs: number,
  totalPricePaise: number,
  customEggs: Array<{ memberId: string; eggs: number }>
): Array<{ memberId: string; eggs: number; amountPaise: number }> {
  if (totalEggs <= 0) {
    return customEggs.map((c) => ({ ...c, amountPaise: 0 }));
  }
  let sumPaise = 0;
  const items = customEggs.map((c, idx) => {
    const exact = (totalPricePaise * c.eggs) / totalEggs;
    const floored = Math.floor(exact);
    sumPaise += floored;
    return { ...c, amountPaise: floored, fraction: exact - floored, idx };
  });
  let rem = totalPricePaise - sumPaise;
  const sorted = [...items].sort((a, b) => (b.fraction !== a.fraction ? b.fraction - a.fraction : a.idx - b.idx));
  for (let i = 0; i < rem && sorted.length > 0; i++) {
    const targetIdx = sorted[i % sorted.length].idx;
    items[targetIdx].amountPaise += 1;
  }
  return items.map(({ memberId, eggs, amountPaise }) => ({ memberId, eggs, amountPaise }));
}

export function deriveAllocationPaymentStatus(
  allocatedPaise: number,
  paidPaise: number,
  pendingPaise: number
): PaymentStatusLabel {
  if (paidPaise >= allocatedPaise) return 'Paid';
  if (pendingPaise > 0) return 'Waiting for Confirmation';
  if (paidPaise > 0) return 'Partially Paid';
  return 'Not Paid';
}

// ============================================================================
// 3. FIFO INVENTORY RECALCULATION ENGINE (ATOMIC & DETERMINISTIC)
// ============================================================================

export function recalculateHouseholdInventoryFIFO(
  db: EggMateDatabase,
  householdId: string
): { batches: InventoryBatch[]; logs: ConsumptionLog[] } {
  const activePurchases = db.purchases
    .filter((p) => p.household_id === householdId && !p.is_deleted)
    .sort((a, b) =>
      a.purchase_date !== b.purchase_date
        ? a.purchase_date.localeCompare(b.purchase_date)
        : a.created_at.localeCompare(b.created_at)
    );

  const batches: InventoryBatch[] = activePurchases.map((p) => ({
    id: `batch_${p.id}`,
    household_id: householdId,
    purchase_id: p.id,
    initial_eggs: p.total_eggs,
    remaining_eggs: p.total_eggs,
    cost_per_egg_paise: p.cost_per_egg_paise,
    batch_date: p.purchase_date,
    created_at: p.created_at,
    updated_at: new Date().toISOString()
  }));

  const householdLogs = db.consumption_logs
    .filter((l) => l.household_id === householdId)
    .sort((a, b) =>
      a.consumption_date !== b.consumption_date
        ? a.consumption_date.localeCompare(b.consumption_date)
        : a.created_at.localeCompare(b.created_at)
    );

  const updatedLogs: ConsumptionLog[] = householdLogs.map((log) => {
    let needed = log.eggs_count;
    let fifoCost = 0;
    for (const batch of batches) {
      if (needed <= 0) break;
      if (batch.remaining_eggs > 0) {
        const take = Math.min(batch.remaining_eggs, needed);
        batch.remaining_eggs -= take;
        fifoCost += take * batch.cost_per_egg_paise;
        needed -= take;
      }
    }
    return {
      ...log,
      fifo_cost_paise: fifoCost
    };
  });

  const otherBatches = db.inventory_batches.filter((b) => b.household_id !== householdId);
  const otherLogs = db.consumption_logs.filter((l) => l.household_id !== householdId);

  return {
    batches: [...otherBatches, ...batches],
    logs: [...otherLogs, ...updatedLogs]
  };
}

// ============================================================================
// 4. INITIAL SEED DATA: SECTION 18 FINAL TESTING SCENARIO
// ============================================================================

export function buildSection18SeedDatabase(): EggMateDatabase {
  const hId = 'hh_sunrise_302';
  const m1 = 'mem_mahesh';
  const m2 = 'mem_member2';
  const m3 = 'mem_member3';
  const m4 = 'mem_member4';
  const p1 = 'pur_monday_40';

  // Monday of current week: 2026-11-09 (09/11/2026)
  const mondayDate = '2026-11-09';
  const createdTs = '2026-11-09T08:30:00.000Z';

  const households: Household[] = [
    {
      id: hId,
      room_code: 'EGG-302',
      name: 'Sunrise Flat 302',
      pin_code: '1234',
      expected_member_count: 4,
      created_by: m1,
      created_at: createdTs,
      updated_at: createdTs
    }
  ];

  const household_members: HouseholdMember[] = [
    {
      id: m1,
      household_id: hId,
      name: 'Mahesh',
      avatar: '🧑‍🍳',
      role: 'admin',
      status: 'active',
      default_daily_eggs: 2,
      joined_at: createdTs,
      created_at: createdTs,
      updated_at: createdTs
    },
    {
      id: m2,
      household_id: hId,
      name: 'Member 2',
      avatar: '🧑‍💻',
      role: 'member',
      status: 'active',
      default_daily_eggs: 2,
      joined_at: createdTs,
      created_at: createdTs,
      updated_at: createdTs
    },
    {
      id: m3,
      household_id: hId,
      name: 'Member 3',
      avatar: '🏋️',
      role: 'member',
      status: 'active',
      default_daily_eggs: 2,
      joined_at: createdTs,
      created_at: createdTs,
      updated_at: createdTs
    },
    {
      id: m4,
      household_id: hId,
      name: 'Member 4',
      avatar: '🎸',
      role: 'member',
      status: 'active',
      default_daily_eggs: 2,
      joined_at: createdTs,
      created_at: createdTs,
      updated_at: createdTs
    }
  ];

  // 2 eggs per weekday (Mon-Fri) and 0 eggs on Saturday and Sunday
  const member_schedules: MemberSchedule[] = [m1, m2, m3, m4].map((mId, i) => ({
    id: `sched_${i + 1}`,
    household_id: hId,
    member_id: mId,
    mon: 2,
    tue: 2,
    wed: 2,
    thu: 2,
    fri: 2,
    sat: 0,
    sun: 0,
    updated_at: createdTs
  }));

  const household_settings: HouseholdSettings[] = [
    {
      id: 'set_1',
      household_id: hId,
      low_stock_threshold: 8,
      reminder_lead_days: 3,
      prediction_mode: 'schedule',
      browser_notifications_enabled: false,
      updated_at: createdTs
    }
  ];

  // Monday: Mahesh purchases 40 eggs for ₹280 (28000 paise, ₹7/egg = 700 paise)
  const purchases: Purchase[] = [
    {
      id: p1,
      household_id: hId,
      purchased_by: m1,
      purchase_date: mondayDate,
      total_eggs: 40,
      total_price_paise: 28000,
      cost_per_egg_paise: 700,
      notes: 'Monday tray purchase (40 farm fresh eggs)',
      allocation_status: 'finalized',
      version: 1,
      is_deleted: false,
      created_at: '2026-11-09T09:00:00.000Z',
      updated_at: '2026-11-09T09:30:00.000Z'
    }
  ];

  // All 4 members accept their 10 eggs / ₹70 allocations.
  // Mahesh's own ₹70 share is automatically Paid (he paid ₹280 upfront).
  // Member 2 paid ₹50, confirmed by Mahesh -> ₹20 remaining (Partially Paid).
  // Member 3 and Member 4 owe ₹70 each (Not Paid).
  const purchase_allocations: PurchaseAllocation[] = [
    {
      id: 'alloc_m1',
      household_id: hId,
      purchase_id: p1,
      member_id: m1,
      allocated_eggs: 10,
      allocated_amount_paise: 7000,
      approval_status: 'accepted',
      accepted_at: '2026-11-09T09:00:00.000Z',
      paid_amount_paise: 7000,
      pending_confirmation_paise: 0,
      payment_status: 'Paid',
      updated_at: '2026-11-09T09:00:00.000Z'
    },
    {
      id: 'alloc_m2',
      household_id: hId,
      purchase_id: p1,
      member_id: m2,
      allocated_eggs: 10,
      allocated_amount_paise: 7000,
      approval_status: 'accepted',
      accepted_at: '2026-11-09T09:10:00.000Z',
      paid_amount_paise: 5000,
      pending_confirmation_paise: 0,
      payment_status: 'Partially Paid',
      updated_at: '2026-11-09T11:15:00.000Z'
    },
    {
      id: 'alloc_m3',
      household_id: hId,
      purchase_id: p1,
      member_id: m3,
      allocated_eggs: 10,
      allocated_amount_paise: 7000,
      approval_status: 'accepted',
      accepted_at: '2026-11-09T09:15:00.000Z',
      paid_amount_paise: 0,
      pending_confirmation_paise: 0,
      payment_status: 'Not Paid',
      updated_at: '2026-11-09T09:15:00.000Z'
    },
    {
      id: 'alloc_m4',
      household_id: hId,
      purchase_id: p1,
      member_id: m4,
      allocated_eggs: 10,
      allocated_amount_paise: 7000,
      approval_status: 'accepted',
      accepted_at: '2026-11-09T09:20:00.000Z',
      paid_amount_paise: 0,
      pending_confirmation_paise: 0,
      payment_status: 'Not Paid',
      updated_at: '2026-11-09T09:20:00.000Z'
    }
  ];

  // Consumption: Mahesh (2), Member 2 (2), Member 3 (2), Member 4 (2) -> 8 consumed, 32 remaining
  const consumption_logs: ConsumptionLog[] = [
    {
      id: 'log_1',
      household_id: hId,
      member_id: m1,
      consumption_date: mondayDate,
      eggs_count: 2,
      fifo_cost_paise: 1400,
      log_type: 'consumption',
      description: 'Morning boiled eggs',
      recorded_by: m1,
      created_at: '2026-11-09T09:35:00.000Z',
      updated_at: '2026-11-09T09:35:00.000Z'
    },
    {
      id: 'log_2',
      household_id: hId,
      member_id: m2,
      consumption_date: mondayDate,
      eggs_count: 2,
      fifo_cost_paise: 1400,
      log_type: 'consumption',
      description: 'Breakfast omelette',
      recorded_by: m2,
      created_at: '2026-11-09T09:42:00.000Z',
      updated_at: '2026-11-09T09:42:00.000Z'
    },
    {
      id: 'log_3',
      household_id: hId,
      member_id: m3,
      consumption_date: mondayDate,
      eggs_count: 2,
      fifo_cost_paise: 1400,
      log_type: 'consumption',
      description: 'Post-workout eggs',
      recorded_by: m3,
      created_at: '2026-11-09T10:05:00.000Z',
      updated_at: '2026-11-09T10:05:00.000Z'
    },
    {
      id: 'log_4',
      household_id: hId,
      member_id: m4,
      consumption_date: mondayDate,
      eggs_count: 2,
      fifo_cost_paise: 1400,
      log_type: 'consumption',
      description: 'Scrambled eggs',
      recorded_by: m4,
      created_at: '2026-11-09T10:20:00.000Z',
      updated_at: '2026-11-09T10:20:00.000Z'
    }
  ];

  const inventory_batches: InventoryBatch[] = [
    {
      id: `batch_${p1}`,
      household_id: hId,
      purchase_id: p1,
      initial_eggs: 40,
      remaining_eggs: 32,
      cost_per_egg_paise: 700,
      batch_date: mondayDate,
      created_at: '2026-11-09T09:00:00.000Z',
      updated_at: '2026-11-09T10:20:00.000Z'
    }
  ];

  // Member 2 pays Mahesh ₹50; Mahesh confirms receiving ₹50
  const payment_records: PaymentRecord[] = [
    {
      id: 'pay_1',
      household_id: hId,
      purchase_id: p1,
      allocation_id: 'alloc_m2',
      from_member_id: m2,
      to_member_id: m1,
      amount_paise: 5000,
      payment_date: mondayDate,
      payment_method: 'UPI (GPay)',
      note: 'Partial payment for Monday egg tray',
      status: 'Confirmed',
      created_at: '2026-11-09T11:00:00.000Z',
      updated_at: '2026-11-09T11:15:00.000Z'
    }
  ];

  const payment_confirmations: PaymentConfirmation[] = [
    {
      id: 'conf_1',
      household_id: hId,
      payment_record_id: 'pay_1',
      confirmed_by: m1,
      action: 'confirmed',
      reason: 'Received ₹50 on GPay',
      confirmed_at: '2026-11-09T11:15:00.000Z'
    }
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif_shortage_fri',
      household_id: hId,
      target_member_id: null,
      type: 'shortage_warning',
      title: 'Eggs will run out on Friday (13/11/2026)',
      message:
        'At 8 eggs/day (2 per roommate Mon–Fri), your 32 remaining eggs will reach 0 on Friday, 13/11/2026. Please arrange a new purchase before Monday.',
      dedup_key: `shortage_${hId}_2026-11-13`,
      is_read_by: [],
      is_active: true,
      created_at: '2026-11-09T11:20:00.000Z'
    },
    {
      id: 'notif_pay_conf_1',
      household_id: hId,
      target_member_id: m2,
      type: 'payment_confirmed',
      title: 'Mahesh confirmed receiving your payment',
      message: 'Mahesh confirmed receiving ₹50 for the 09/11/2026 purchase. Your remaining balance is ₹20.',
      dedup_key: 'pay_conf_1',
      is_read_by: [],
      is_active: true,
      created_at: '2026-11-09T11:15:00.000Z'
    },
    {
      id: 'notif_pur_1',
      household_id: hId,
      target_member_id: null,
      type: 'purchase_added',
      title: 'Mahesh added a new purchase',
      message: 'Mahesh purchased 40 eggs for ₹280 (₹7/egg). Each member share is 10 eggs (₹70).',
      dedup_key: 'pur_added_1',
      is_read_by: [m1, m2],
      is_active: true,
      created_at: '2026-11-09T09:00:00.000Z'
    }
  ];

  const activity_logs: ActivityLog[] = [
    {
      id: 'act_7',
      household_id: hId,
      actor_member_id: m1,
      category: 'payment',
      message: 'Mahesh confirmed receiving ₹50 from Member 2.',
      created_at: '2026-11-09T11:15:00.000Z'
    },
    {
      id: 'act_6',
      household_id: hId,
      actor_member_id: m2,
      category: 'payment',
      message: 'Member 2 paid ₹50 to Mahesh.',
      created_at: '2026-11-09T11:00:00.000Z'
    },
    {
      id: 'act_5',
      household_id: hId,
      actor_member_id: m4,
      category: 'consumption',
      message: 'Member 4 consumed 2 eggs (Scrambled eggs).',
      created_at: '2026-11-09T10:20:00.000Z'
    },
    {
      id: 'act_4',
      household_id: hId,
      actor_member_id: m3,
      category: 'consumption',
      message: 'Member 3 consumed 2 eggs (Post-workout eggs).',
      created_at: '2026-11-09T10:05:00.000Z'
    },
    {
      id: 'act_3',
      household_id: hId,
      actor_member_id: m2,
      category: 'consumption',
      message: 'Member 2 consumed 2 eggs (Breakfast omelette).',
      created_at: '2026-11-09T09:42:00.000Z'
    },
    {
      id: 'act_2',
      household_id: hId,
      actor_member_id: m1,
      category: 'consumption',
      message: 'Mahesh consumed 2 eggs (Morning boiled eggs).',
      created_at: '2026-11-09T09:35:00.000Z'
    },
    {
      id: 'act_1',
      household_id: hId,
      actor_member_id: m1,
      category: 'purchase',
      message: 'Mahesh purchased 40 eggs for ₹280.',
      created_at: '2026-11-09T09:00:00.000Z'
    }
  ];

  return {
    households,
    household_members,
    member_schedules,
    household_settings,
    purchases,
    inventory_batches,
    purchase_allocations,
    consumption_logs,
    payment_records,
    payment_confirmations,
    notifications,
    activity_logs
  };
}

// ============================================================================
// 5. SMART PURCHASE PREDICTION & REMINDER SCHEDULE ENGINE
// ============================================================================

export interface DailyForecastRow {
  date: string;
  dayName: string;
  isActualLogged: boolean;
  eggsConsumedOrPlanned: number;
  remainingAfter: number;
  statusLabel: string;
}

export interface PredictionResult {
  exhaustionDate: string | null;
  exhaustionDayName: string | null;
  nextBuyDate: string | null;
  daysUntilExhaustion: number | null;
  isLowStockOrShortageWindow: boolean;
  dailyExpectedAverage: number;
  forecastRows: DailyForecastRow[];
  reminderSchedule: Array<{
    date: string;
    dayName: string;
    message: string;
    severity: 'urgent' | 'warning' | 'info';
  }>;
}

export function computeSmartPrediction(
  availableEggs: number,
  activeMembers: HouseholdMember[],
  schedules: MemberSchedule[],
  consumptionLogs: ConsumptionLog[],
  settings: HouseholdSettings,
  referenceWeekStartDate = '2026-11-09'
): PredictionResult {
  if (activeMembers.length === 0) {
    return {
      exhaustionDate: null,
      exhaustionDayName: null,
      nextBuyDate: null,
      daysUntilExhaustion: null,
      isLowStockOrShortageWindow: availableEggs <= settings.low_stock_threshold,
      dailyExpectedAverage: 0,
      forecastRows: [],
      reminderSchedule: []
    };
  }

  // Helper to get planned household consumption for a given date
  const getScheduledForDate = (isoDate: string): number => {
    if (settings.prediction_mode === 'actual_average') {
      const totalLogged = consumptionLogs
        .filter((l) => l.log_type === 'consumption')
        .reduce((acc, l) => acc + l.eggs_count, 0);
      const distinctDays = new Set(consumptionLogs.map((l) => l.consumption_date)).size || 1;
      return Math.max(1, Math.round(totalLogged / distinctDays));
    }
    const key = getScheduleKeyForDate(isoDate);
    return activeMembers.reduce((sum, mem) => {
      const sched = schedules.find((s) => s.member_id === mem.id);
      const val = sched ? sched[key] : mem.default_daily_eggs;
      return sum + Number(val || 0);
    }, 0);
  };

  // Determine the latest date with recorded consumption so we can show Monday's logged consumption
  // and project forward day-by-day from the remaining inventory.
  const loggedByDate = new Map<string, number>();
  for (const log of consumptionLogs) {
    loggedByDate.set(log.consumption_date, (loggedByDate.get(log.consumption_date) || 0) + log.eggs_count);
  }

  const totalWeeklyScheduled = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].reduce((acc, k) => {
    const key = k as keyof Pick<MemberSchedule, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    return (
      acc +
      activeMembers.reduce((s, m) => {
        const sc = schedules.find((x) => x.member_id === m.id);
        return s + (sc ? sc[key] : m.default_daily_eggs);
      }, 0)
    );
  }, 0);

  const dailyExpectedAverage = Number((totalWeeklyScheduled / 7).toFixed(1));

  const forecastRows: DailyForecastRow[] = [];
  let runningRemaining = availableEggs;
  let exhaustionDate: string | null = null;
  let exhaustionDayName: string | null = null;
  let daysUntilExhaustion: number | null = null;

  // If Monday (referenceWeekStartDate) has actual logged consumption, include it at the top of the 7-day table
  const mondayLogged = loggedByDate.get(referenceWeekStartDate) || 0;
  let startOffset = 0;
  if (mondayLogged > 0) {
    forecastRows.push({
      date: referenceWeekStartDate,
      dayName: getDayName(referenceWeekStartDate),
      isActualLogged: true,
      eggsConsumedOrPlanned: mondayLogged,
      remainingAfter: runningRemaining,
      statusLabel: 'Recorded'
    });
    if (runningRemaining <= 0) {
      exhaustionDate = referenceWeekStartDate;
      exhaustionDayName = getDayName(referenceWeekStartDate);
      daysUntilExhaustion = 0;
    }
    startOffset = 1;
  }

  for (let d = startOffset; d < 21; d++) {
    const dateStr = addDaysISO(referenceWeekStartDate, d);
    const dayName = getDayName(dateStr);
    const loggedOnDay = loggedByDate.get(dateStr) || 0;
    const plannedForDay = getScheduledForDate(dateStr);
    const effectiveUse = loggedOnDay > 0 ? loggedOnDay : plannedForDay;

    if (loggedOnDay === 0) {
      runningRemaining = Math.max(0, runningRemaining - plannedForDay);
    }

    if (d < 7) {
      forecastRows.push({
        date: dateStr,
        dayName,
        isActualLogged: loggedOnDay > 0,
        eggsConsumedOrPlanned: effectiveUse,
        remainingAfter: runningRemaining,
        statusLabel:
          runningRemaining === 0 && effectiveUse > 0 && exhaustionDate === null
            ? 'Runs Out!'
            : runningRemaining === 0
            ? 'Out of Stock'
            : loggedOnDay > 0
            ? 'Recorded'
            : plannedForDay === 0
            ? 'No Planned Use'
            : 'Planned'
      });
    }

    if (runningRemaining <= 0 && exhaustionDate === null) {
      exhaustionDate = dateStr;
      exhaustionDayName = dayName;
      daysUntilExhaustion = d - startOffset + 1;
    }
  }

  // Build dynamic reminder schedule around the predicted exhaustion date
  const reminderSchedule: Array<{
    date: string;
    dayName: string;
    message: string;
    severity: 'urgent' | 'warning' | 'info';
  }> = [];

  if (exhaustionDate) {
    const exDayName = getDayName(exhaustionDate);
    const dayAfter1 = addDaysISO(exhaustionDate, 1);
    const dayAfter2 = addDaysISO(exhaustionDate, 2);
    const dayAfter3 = addDaysISO(exhaustionDate, 3);

    reminderSchedule.push({
      date: exhaustionDate,
      dayName: exDayName,
      message: `Eggs will run out on ${exDayName} (${formatDateIN(exhaustionDate)}). Please arrange a new purchase.`,
      severity: 'urgent'
    });
    reminderSchedule.push({
      date: dayAfter1,
      dayName: getDayName(dayAfter1),
      message: `New eggs are needed (${getDayName(dayAfter1)}, ${formatDateIN(dayAfter1)}). Inventory is at 0.`,
      severity: 'warning'
    });
    reminderSchedule.push({
      date: dayAfter2,
      dayName: getDayName(dayAfter2),
      message: `Reminder to purchase eggs before ${getDayName(dayAfter3)} (${formatDateIN(dayAfter3)}).`,
      severity: 'urgent'
    });
  }

  const isLowStockOrShortageWindow =
    availableEggs <= settings.low_stock_threshold ||
    (daysUntilExhaustion !== null && daysUntilExhaustion <= settings.reminder_lead_days + 2);

  return {
    exhaustionDate,
    exhaustionDayName,
    nextBuyDate: exhaustionDate,
    daysUntilExhaustion,
    isLowStockOrShortageWindow,
    dailyExpectedAverage,
    forecastRows,
    reminderSchedule
  };
}

// ============================================================================
// 6. MAIN EGGMATE APPLICATION COMPONENT
// ============================================================================

export default function App() {
  // Persistent Database State
  const [db, setDb] = useState<EggMateDatabase>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.households)) {
          return parsed;
        }
      }
    } catch {
      // ignore storage read error
    }
    return buildSection18SeedDatabase();
  });

  // Active Household & Logged-In Member Profile Session
  const [session, setSession] = useState<{ householdId: string; memberId: string } | null>(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.householdId && parsed.memberId) return parsed;
      }
    } catch {
      // ignore
    }
    return { householdId: 'hh_sunrise_302', memberId: 'mem_mahesh' };
  });

  // Persist DB & Broadcast across tabs
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // ignore quota error
    }
  }, [db]);

  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }, [session]);

  // Navigation & Active Modals
  const [activeTab, setActiveTab] = useState<'home' | 'my_eggs' | 'add_eggs' | 'payments' | 'members' | 'reports' | 'settings'>('home');
  const [addMode, setAddMode] = useState<'consume' | 'purchase' | 'waste'>('consume');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [roomSwitcherOpen, setRoomSwitcherOpen] = useState(false);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Live Supabase Cloud Connection State (pre-connected to user's Supabase project)
  const DEFAULT_SUPABASE_URL = 'https://oqbvwclneqjyhepkfhdv.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'sb_publishable_iyAh9t7IDUPuWGhxNZDy4A_iE_C1xkU';

  const [supabaseUrl, setSupabaseUrl] = useState<string>(() => {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
      if (env?.VITE_SUPABASE_URL) return env.VITE_SUPABASE_URL;
      return localStorage.getItem('eggmate_supabase_url') || DEFAULT_SUPABASE_URL;
    } catch {
      return DEFAULT_SUPABASE_URL;
    }
  });
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>(() => {
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
      if (env?.VITE_SUPABASE_PUBLISHABLE_KEY) return env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (env?.VITE_SUPABASE_ANON_KEY) return env.VITE_SUPABASE_ANON_KEY;
      return localStorage.getItem('eggmate_supabase_anon_key') || DEFAULT_SUPABASE_KEY;
    } catch {
      return DEFAULT_SUPABASE_KEY;
    }
  });
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const initialCloudPullDoneRef = useRef<boolean>(false);

  // Toast Feedback System (replaces browser alert/confirm)
  const [toast, setToast] = useState<{ id: string; type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ id: uid('toast'), type, text });
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // Submission lock & idempotency guard against simultaneous/duplicate clicks
  const submissionLockRef = useRef<{ busy: boolean; lastHash: string; lastTime: number }>({
    busy: false,
    lastHash: '',
    lastTime: 0
  });

  // Reference Date (matches prompt metadata 11/11/2026)
  const todayISO = '2026-11-11';

  // Derived Current Household & Member
  const currentHousehold = useMemo(
    () => db.households.find((h) => h.id === session?.householdId) || null,
    [db.households, session]
  );

  const householdMembers = useMemo(
    () =>
      currentHousehold
        ? db.household_members.filter((m) => m.household_id === currentHousehold.id)
        : [],
    [db.household_members, currentHousehold]
  );

  const activeMembers = useMemo(
    () => householdMembers.filter((m) => m.status === 'active'),
    [householdMembers]
  );

  const currentMember = useMemo(
    () => householdMembers.find((m) => m.id === session?.memberId) || activeMembers[0] || null,
    [householdMembers, activeMembers, session]
  );

  const isAdmin = currentMember?.role === 'admin';

  const currentSettings = useMemo<HouseholdSettings>(() => {
    const found = db.household_settings.find((s) => s.household_id === currentHousehold?.id);
    return (
      found || {
        id: 'default_set',
        household_id: currentHousehold?.id || '',
        low_stock_threshold: 8,
        reminder_lead_days: 3,
        prediction_mode: 'schedule',
        browser_notifications_enabled: false,
        updated_at: new Date().toISOString()
      }
    );
  }, [db.household_settings, currentHousehold]);

  const householdSchedules = useMemo(
    () => db.member_schedules.filter((s) => s.household_id === currentHousehold?.id),
    [db.member_schedules, currentHousehold]
  );

  const householdPurchases = useMemo(
    () =>
      db.purchases
        .filter((p) => p.household_id === currentHousehold?.id && !p.is_deleted)
        .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date) || b.created_at.localeCompare(a.created_at)),
    [db.purchases, currentHousehold]
  );

  const householdAllocations = useMemo(
    () => db.purchase_allocations.filter((a) => a.household_id === currentHousehold?.id),
    [db.purchase_allocations, currentHousehold]
  );

  const householdConsumption = useMemo(
    () =>
      db.consumption_logs
        .filter((c) => c.household_id === currentHousehold?.id)
        .sort((a, b) => b.consumption_date.localeCompare(a.consumption_date) || b.created_at.localeCompare(a.created_at)),
    [db.consumption_logs, currentHousehold]
  );

  const householdPayments = useMemo(
    () =>
      db.payment_records
        .filter((p) => p.household_id === currentHousehold?.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [db.payment_records, currentHousehold]
  );

  const householdActivities = useMemo(
    () =>
      db.activity_logs
        .filter((a) => a.household_id === currentHousehold?.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [db.activity_logs, currentHousehold]
  );

  const memberMap = useMemo(() => {
    const map = new Map<string, HouseholdMember>();
    for (const m of householdMembers) map.set(m.id, m);
    return map;
  }, [householdMembers]);

  // Core Inventory Totals
  const inventoryStats = useMemo(() => {
    const totalBought = householdPurchases.reduce((sum, p) => sum + p.total_eggs, 0);
    const totalSpentPaise = householdPurchases.reduce((sum, p) => sum + p.total_price_paise, 0);
    const totalUsed = householdConsumption
      .filter((c) => c.log_type === 'consumption')
      .reduce((sum, c) => sum + c.eggs_count, 0);
    const totalWasted = householdConsumption
      .filter((c) => c.log_type === 'waste')
      .reduce((sum, c) => sum + c.eggs_count, 0);
    const totalWastedCostPaise = householdConsumption
      .filter((c) => c.log_type === 'waste')
      .reduce((sum, c) => sum + c.fifo_cost_paise, 0);
    const availableEggs = Math.max(0, totalBought - totalUsed - totalWasted);
    const pctRemaining = totalBought > 0 ? Math.min(100, Math.round((availableEggs / totalBought) * 100)) : 0;

    return {
      totalBought,
      totalSpentPaise,
      totalUsed,
      totalWasted,
      totalWastedCostPaise,
      availableEggs,
      pctRemaining
    };
  }, [householdPurchases, householdConsumption]);

  // Smart Purchase Prediction & Exhaustion Date
  const prediction = useMemo(
    () =>
      computeSmartPrediction(
        inventoryStats.availableEggs,
        activeMembers,
        householdSchedules,
        householdConsumption,
        currentSettings,
        '2026-11-09'
      ),
    [inventoryStats.availableEggs, activeMembers, householdSchedules, householdConsumption, currentSettings]
  );

  // Relevant Notifications for Current Member
  const visibleNotifications = useMemo(() => {
    if (!currentHousehold || !currentMember) return [];
    return db.notifications
      .filter(
        (n) =>
          n.household_id === currentHousehold.id &&
          n.is_active &&
          (n.target_member_id === null || n.target_member_id === currentMember.id)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [db.notifications, currentHousehold, currentMember]);

  const unreadNotificationsCount = useMemo(() => {
    if (!currentMember) return 0;
    return visibleNotifications.filter((n) => !n.is_read_by.includes(currentMember.id)).length;
  }, [visibleNotifications, currentMember]);

  // Member Financial & Consumption Metrics
  const memberSummaries = useMemo(() => {
    const activePurchaseIds = new Set(householdPurchases.map((p) => p.id));
    const validAllocations = householdAllocations.filter((a) => activePurchaseIds.has(a.purchase_id));

    return householdMembers.map((mem) => {
      const memLogs = householdConsumption.filter((c) => c.member_id === mem.id && c.log_type === 'consumption');
      const eggsUsed = memLogs.reduce((s, c) => s + c.eggs_count, 0);
      const fifoConsumptionValuePaise = memLogs.reduce((s, c) => s + c.fifo_cost_paise, 0);

      // This month consumption (2026-11)
      const eggsUsedThisMonth = memLogs
        .filter((c) => c.consumption_date.startsWith('2026-11'))
        .reduce((s, c) => s + c.eggs_count, 0);

      const sched = householdSchedules.find((s) => s.member_id === mem.id);
      const weeklyScheduled = sched
        ? sched.mon + sched.tue + sched.wed + sched.thu + sched.fri + sched.sat + sched.sun
        : mem.default_daily_eggs * 7;
      const scheduledDailyAvg = Number((weeklyScheduled / 7).toFixed(1));

      // Allocations for this member
      const memAllocations = validAllocations.filter((a) => a.member_id === mem.id);
      const allocatedEggs = memAllocations.reduce((s, a) => s + a.allocated_eggs, 0);
      const purchaseSharePaise = memAllocations.reduce((s, a) => s + a.allocated_amount_paise, 0);
      const confirmedPaidPaise = memAllocations.reduce((s, a) => s + a.paid_amount_paise, 0);
      const pendingConfirmationPaise = memAllocations.reduce((s, a) => s + a.pending_confirmation_paise, 0);
      const remainingDuePaise = Math.max(0, purchaseSharePaise - confirmedPaidPaise);

      // Purchases made BY this member (where others owe them)
      const purchasesByMember = householdPurchases.filter((p) => p.purchased_by === mem.id);
      const upfrontPurchaseTotalPaise = purchasesByMember.reduce((s, p) => s + p.total_price_paise, 0);
      const otherMemberAllocationsOnMyPurchases = validAllocations.filter(
        (a) => purchasesByMember.some((p) => p.id === a.purchase_id) && a.member_id !== mem.id
      );
      const expectedFromOthersPaise = otherMemberAllocationsOnMyPurchases.reduce(
        (s, a) => s + a.allocated_amount_paise,
        0
      );
      const receivedFromOthersPaise = otherMemberAllocationsOnMyPurchases.reduce(
        (s, a) => s + a.paid_amount_paise,
        0
      );
      const waitingToReceiveFromOthersPaise = Math.max(0, expectedFromOthersPaise - receivedFromOthersPaise);

      return {
        member: mem,
        schedule: sched,
        eggsUsed,
        eggsUsedThisMonth,
        fifoConsumptionValuePaise,
        scheduledDailyAvg,
        allocatedEggs,
        purchaseSharePaise,
        confirmedPaidPaise,
        pendingConfirmationPaise,
        remainingDuePaise,
        upfrontPurchaseTotalPaise,
        expectedFromOthersPaise,
        receivedFromOthersPaise,
        waitingToReceiveFromOthersPaise
      };
    });
  }, [householdMembers, householdConsumption, householdSchedules, householdPurchases, householdAllocations]);

  const currentMemberSummary = useMemo(
    () => memberSummaries.find((m) => m.member.id === currentMember?.id) || null,
    [memberSummaries, currentMember]
  );

  // Pending Allocations for Current Member to Accept
  const myPendingAllocations = useMemo(() => {
    if (!currentMember) return [];
    const activePurchaseIds = new Set(householdPurchases.map((p) => p.id));
    return householdAllocations.filter(
      (a) =>
        a.member_id === currentMember.id &&
        activePurchaseIds.has(a.purchase_id) &&
        a.approval_status === 'pending'
    );
  }, [householdAllocations, householdPurchases, currentMember]);

  // Pending Payment Confirmations where Current Member is the Purchaser (to_member_id)
  const pendingConfirmationsForMe = useMemo(() => {
    if (!currentMember) return [];
    return householdPayments.filter(
      (p) => p.to_member_id === currentMember.id && p.status === 'Waiting for Confirmation'
    );
  }, [householdPayments, currentMember]);

  // ============================================================================
  // 7. FORMS & INTERACTIVE STATE
  // ============================================================================

  // A. Consumption Form State
  const [consumeMemberId, setConsumeMemberId] = useState<string>('');
  const [consumeQty, setConsumeQty] = useState<number>(2);
  const [consumeCustomMode, setConsumeCustomMode] = useState<boolean>(false);
  const [consumeDate, setConsumeDate] = useState<string>('2026-11-10');
  const [consumeDesc, setConsumeDesc] = useState<string>('Morning boiled eggs');
  const [editingConsumption, setEditingConsumption] = useState<ConsumptionLog | null>(null);

  useEffect(() => {
    if (currentMember) {
      setConsumeMemberId(currentMember.id);
    }
  }, [currentMember]);

  // B. Purchase Form State
  const [purchaseEggs, setPurchaseEggs] = useState<number>(40);
  const [purchasePriceINR, setPurchasePriceINR] = useState<string>('280');
  const [purchaseDate, setPurchaseDate] = useState<string>(todayISO);
  const [purchasedById, setPurchasedById] = useState<string>('');
  const [purchaseNotes, setPurchaseNotes] = useState<string>('');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [customAllocations, setCustomAllocations] = useState<
    Array<{ memberId: string; eggs: number; amountPaise: number }>
  >([]);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);

  useEffect(() => {
    if (currentMember && !editingPurchase) {
      setPurchasedById(currentMember.id);
    }
  }, [currentMember, editingPurchase]);

  // Sync Equal / Custom Allocations whenever purchaseEggs, purchasePriceINR, or activeMembers change
  useEffect(() => {
    if (editingPurchase) return;
    const pricePaise = Math.max(0, Math.round((parseFloat(purchasePriceINR) || 0) * 100));
    const equal = computeEqualSplit(
      Math.max(0, purchaseEggs),
      pricePaise,
      activeMembers.map((m) => m.id)
    );
    setCustomAllocations(equal);
  }, [purchaseEggs, purchasePriceINR, activeMembers, editingPurchase]);

  // C. Waste Form State
  const [wasteEggs, setWasteEggs] = useState<number>(1);
  const [wasteDate, setWasteDate] = useState<string>(todayISO);
  const [wasteReason, setWasteReason] = useState<string>('Cracked shell in tray');

  // D. Record Payment Modal / Form State
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(false);
  const [payToMemberId, setPayToMemberId] = useState<string>('');
  const [payTargetAllocationId, setPayTargetAllocationId] = useState<string>('FIFO_ALL');
  const [payAmountINR, setPayAmountINR] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(todayISO);
  const [payMethod, setPayMethod] = useState<string>('UPI (GPay)');
  const [payNote, setPayNote] = useState<string>('');

  // E. Create / Join Room Form State
  const [authTab, setAuthTab] = useState<'switch' | 'create' | 'join'>('switch');
  const [newRoomName, setNewRoomName] = useState<string>('');
  const [newRoomAdminName, setNewRoomAdminName] = useState<string>('');
  const [newRoomAvatar, setNewRoomAvatar] = useState<string>('🧑‍🍳');
  const [newRoomCount, setNewRoomCount] = useState<number>(4);
  const [newRoomPin, setNewRoomPin] = useState<string>('1234');
  const [newRoomDefaultEggs, setNewRoomDefaultEggs] = useState<number>(2);

  const [joinRoomCode, setJoinRoomCode] = useState<string>('EGG-302');
  const [joinRoomPin, setJoinRoomPin] = useState<string>('1234');
  const [joinMemberName, setJoinMemberName] = useState<string>('');
  const [joinAvatar, setJoinAvatar] = useState<string>('🦊');

  // F. Member Management Form State
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberAvatar, setNewMemberAvatar] = useState<string>('🐼');
  const [newMemberDailyEggs, setNewMemberDailyEggs] = useState<number>(2);
  const [editingMember, setEditingMember] = useState<HouseholdMember | null>(null);

  // G. Reports Filter State
  const [reportFilter, setReportFilter] = useState<'week' | 'month' | 'last_month' | 'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-11-01');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-11-30');

  // ============================================================================
  // 8. CORE TRANSACTIONAL DATABASE OPERATIONS
  // ============================================================================

  // 8.1 Record or Update Egg Consumption / Waste
  const handleRecordConsumption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold || !currentMember) return;

    const targetMemberId = consumeMemberId || currentMember.id;
    const qty = Math.round(Number(consumeQty));
    if (!qty || qty <= 0) {
      showToast('Please enter a valid number of eggs (at least 1).', 'error');
      return;
    }

    // Prevent simultaneous or accidental duplicate click within 1.5s
    const hash = `${targetMemberId}_${qty}_${consumeDate}_${consumeDesc}_${editingConsumption?.id || 'new'}`;
    const now = Date.now();
    if (
      submissionLockRef.current.busy ||
      (submissionLockRef.current.lastHash === hash && now - submissionLockRef.current.lastTime < 1500)
    ) {
      showToast('Duplicate submission prevented.', 'info');
      return;
    }

    const maxAvailable = editingConsumption
      ? inventoryStats.availableEggs + editingConsumption.eggs_count
      : inventoryStats.availableEggs;

    if (qty > maxAvailable) {
      showToast(
        `Cannot record ${qty} eggs! Only ${maxAvailable} eggs are available in household inventory.`,
        'error'
      );
      return;
    }

    submissionLockRef.current = { busy: true, lastHash: hash, lastTime: now };

    try {
      setDb((prev) => {
        const nowIso = new Date().toISOString();
        const actorName = memberMap.get(targetMemberId)?.name || currentMember.name;
        let nextLogs: ConsumptionLog[];
        let activityMsg: string;

        if (editingConsumption) {
          nextLogs = prev.consumption_logs.map((l) =>
            l.id === editingConsumption.id
              ? {
                  ...l,
                  member_id: targetMemberId,
                  consumption_date: consumeDate,
                  eggs_count: qty,
                  description: consumeDesc.trim() || 'Eggs consumed',
                  updated_at: nowIso
                }
              : l
          );
          activityMsg = `${currentMember.name} updated consumption entry for ${actorName} to ${qty} egg${qty > 1 ? 's' : ''} (${formatDateIN(consumeDate)}).`;
        } else {
          const newLog: ConsumptionLog = {
            id: uid('log'),
            household_id: currentHousehold.id,
            member_id: targetMemberId,
            consumption_date: consumeDate,
            eggs_count: qty,
            fifo_cost_paise: 0,
            log_type: 'consumption',
            description: consumeDesc.trim() || 'Eggs consumed',
            recorded_by: currentMember.id,
            created_at: nowIso,
            updated_at: nowIso
          };
          nextLogs = [newLog, ...prev.consumption_logs];
          activityMsg = `${actorName} consumed ${qty} egg${qty > 1 ? 's' : ''}${consumeDesc.trim() ? ` (${consumeDesc.trim()})` : ''}.`;
        }

        const tempDb: EggMateDatabase = {
          ...prev,
          consumption_logs: nextLogs
        };

        const { batches, logs } = recalculateHouseholdInventoryFIFO(tempDb, currentHousehold.id);

        // Check if inventory fell below threshold or needs shortage reminder
        const newAvail = batches
          .filter((b) => b.household_id === currentHousehold.id)
          .reduce((s, b) => s + b.remaining_eggs, 0);

        const nextNotifications = [...prev.notifications];
        if (newAvail <= currentSettings.low_stock_threshold) {
          const dedup = `low_stock_${currentHousehold.id}_${newAvail}`;
          if (!nextNotifications.some((n) => n.dedup_key === dedup && n.is_active)) {
            nextNotifications.unshift({
              id: uid('notif'),
              household_id: currentHousehold.id,
              target_member_id: null,
              type: 'shortage_warning',
              title: newAvail === 0 ? 'Egg inventory reached zero!' : `Low egg stock: ${newAvail} eggs left`,
              message:
                newAvail === 0
                  ? 'Household egg inventory is now 0. Please purchase a new tray today.'
                  : `Only ${newAvail} eggs remain in ${currentHousehold.name}. Plan your next purchase soon.`,
              dedup_key: dedup,
              is_read_by: [],
              is_active: true,
              created_at: nowIso
            });
          }
        }

        const newActivity: ActivityLog = {
          id: uid('act'),
          household_id: currentHousehold.id,
          actor_member_id: currentMember.id,
          category: 'consumption',
          message: activityMsg,
          created_at: nowIso
        };

        return {
          ...tempDb,
          inventory_batches: batches,
          consumption_logs: logs,
          notifications: nextNotifications,
          activity_logs: [newActivity, ...prev.activity_logs]
        };
      });

      showToast(
        editingConsumption
          ? `Updated consumption record (${qty} eggs).`
          : `Recorded ${qty} egg${qty > 1 ? 's' : ''} used! Inventory updated.`
      );
      setEditingConsumption(null);
    } finally {
      submissionLockRef.current.busy = false;
    }
  };

  // 8.2 Delete Consumption Entry
  const handleDeleteConsumption = (log: ConsumptionLog) => {
    if (!currentHousehold || !currentMember) return;
    if (!isAdmin && log.member_id !== currentMember.id) {
      showToast('You can only delete your own consumption entries.', 'error');
      return;
    }

    setDb((prev) => {
      const nowIso = new Date().toISOString();
      const filteredLogs = prev.consumption_logs.filter((l) => l.id !== log.id);
      const tempDb = { ...prev, consumption_logs: filteredLogs };
      const { batches, logs } = recalculateHouseholdInventoryFIFO(tempDb, currentHousehold.id);
      const ownerName = memberMap.get(log.member_id)?.name || 'Member';

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: 'audit',
        message: `${currentMember.name} deleted ${ownerName}'s ${log.eggs_count}-egg ${log.log_type} entry from ${formatDateIN(log.consumption_date)}.`,
        created_at: nowIso
      };

      return {
        ...tempDb,
        inventory_batches: batches,
        consumption_logs: logs,
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    showToast(`Deleted ${log.eggs_count}-egg entry and restored inventory.`, 'info');
  };

  // 8.3 Record Waste
  const handleRecordWaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold || !currentMember) return;
    const qty = Math.round(Number(wasteEggs));
    if (!qty || qty <= 0) {
      showToast('Enter a valid waste quantity.', 'error');
      return;
    }
    if (qty > inventoryStats.availableEggs) {
      showToast(`Waste quantity (${qty}) cannot exceed available inventory (${inventoryStats.availableEggs}).`, 'error');
      return;
    }

    setDb((prev) => {
      const nowIso = new Date().toISOString();
      const wasteLog: ConsumptionLog = {
        id: uid('waste'),
        household_id: currentHousehold.id,
        member_id: currentMember.id,
        consumption_date: wasteDate,
        eggs_count: qty,
        fifo_cost_paise: 0,
        log_type: 'waste',
        description: wasteReason.trim() || 'Damaged / spoiled eggs',
        recorded_by: currentMember.id,
        created_at: nowIso,
        updated_at: nowIso
      };

      const tempDb = {
        ...prev,
        consumption_logs: [wasteLog, ...prev.consumption_logs]
      };
      const { batches, logs } = recalculateHouseholdInventoryFIFO(tempDb, currentHousehold.id);

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: 'consumption',
        message: `${currentMember.name} recorded ${qty} wasted egg${qty > 1 ? 's' : ''} (${wasteReason.trim() || 'Damaged'}).`,
        created_at: nowIso
      };

      return {
        ...tempDb,
        inventory_batches: batches,
        consumption_logs: logs,
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    showToast(`Recorded ${qty} wasted egg${qty > 1 ? 's' : ''}. Inventory updated.`, 'info');
  };

  // 8.4 Add or Edit Egg Purchase with Automatic / Custom Split & Member Approval
  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold || !currentMember) return;

    const totalEggs = Math.round(Number(purchaseEggs));
    const totalPricePaise = Math.round((parseFloat(purchasePriceINR) || 0) * 100);

    if (totalEggs <= 0 || totalPricePaise <= 0) {
      showToast('Please enter a valid egg quantity and total price in ₹.', 'error');
      return;
    }

    // Validate allocation totals
    const sumAllocEggs = customAllocations.reduce((s, a) => s + Number(a.eggs || 0), 0);
    const sumAllocPaise = customAllocations.reduce((s, a) => s + Number(a.amountPaise || 0), 0);

    if (sumAllocEggs !== totalEggs) {
      showToast(
        `Allocated eggs (${sumAllocEggs}) must equal total purchased eggs (${totalEggs}).`,
        'error'
      );
      return;
    }

    if (Math.abs(sumAllocPaise - totalPricePaise) > 1) {
      showToast(
        `Allocated money (${formatINR(sumAllocPaise)}) must equal total purchase price (${formatINR(totalPricePaise)}).`,
        'error'
      );
      return;
    }

    // Prevent reducing total eggs below already consumed quantity if editing
    if (editingPurchase) {
      const otherPurchasesEggs = householdPurchases
        .filter((p) => p.id !== editingPurchase.id)
        .reduce((s, p) => s + p.total_eggs, 0);
      const totalUsedOrWasted = inventoryStats.totalUsed + inventoryStats.totalWasted;
      if (otherPurchasesEggs + totalEggs < totalUsedOrWasted) {
        showToast(
          `Cannot reduce purchase to ${totalEggs} eggs because ${totalUsedOrWasted} eggs have already been consumed/wasted.`,
          'error'
        );
        return;
      }
    }

    const buyerId = purchasedById || currentMember.id;
    const buyerName = memberMap.get(buyerId)?.name || currentMember.name;
    const costPerEggPaise = Math.round(totalPricePaise / totalEggs);

    setDb((prev) => {
      const nowIso = new Date().toISOString();
      let targetPurchaseId = editingPurchase ? editingPurchase.id : uid('pur');

      let nextPurchases: Purchase[];
      let nextAllocations = [...prev.purchase_allocations];

      if (editingPurchase) {
        // Preserve already-confirmed payments on each member's allocation!
        const existingAllocs = prev.purchase_allocations.filter((a) => a.purchase_id === editingPurchase.id);
        const updatedAllocs: PurchaseAllocation[] = customAllocations.map((ca) => {
          const oldAlloc = existingAllocs.find((x) => x.member_id === ca.memberId);
          const isBuyer = ca.memberId === buyerId;
          const oldPaid = isBuyer ? ca.amountPaise : oldAlloc ? oldAlloc.paid_amount_paise : 0;
          const oldPending = isBuyer ? 0 : oldAlloc ? oldAlloc.pending_confirmation_paise : 0;
          const changed =
            !oldAlloc ||
            oldAlloc.allocated_eggs !== ca.eggs ||
            oldAlloc.allocated_amount_paise !== ca.amountPaise;

          return {
            id: oldAlloc ? oldAlloc.id : uid('alloc'),
            household_id: currentHousehold.id,
            purchase_id: editingPurchase.id,
            member_id: ca.memberId,
            allocated_eggs: ca.eggs,
            allocated_amount_paise: ca.amountPaise,
            approval_status: isBuyer ? 'accepted' : changed ? 'pending' : oldAlloc.approval_status,
            accepted_at: isBuyer ? nowIso : changed ? undefined : oldAlloc?.accepted_at,
            paid_amount_paise: oldPaid,
            pending_confirmation_paise: oldPending,
            payment_status: deriveAllocationPaymentStatus(ca.amountPaise, oldPaid, oldPending),
            updated_at: nowIso
          };
        });

        const allAccepted = updatedAllocs.every((a) => a.approval_status === 'accepted');

        nextPurchases = prev.purchases.map((p) =>
          p.id === editingPurchase.id
            ? {
                ...p,
                purchased_by: buyerId,
                purchase_date: purchaseDate,
                total_eggs: totalEggs,
                total_price_paise: totalPricePaise,
                cost_per_egg_paise: costPerEggPaise,
                notes: purchaseNotes.trim(),
                allocation_status: allAccepted ? 'finalized' : 'pending_approval',
                version: p.version + 1,
                updated_at: nowIso
              }
            : p
        );

        nextAllocations = [
          ...prev.purchase_allocations.filter((a) => a.purchase_id !== editingPurchase.id),
          ...updatedAllocs
        ];
      } else {
        const newAllocs: PurchaseAllocation[] = customAllocations.map((ca) => {
          const isBuyer = ca.memberId === buyerId;
          return {
            id: uid('alloc'),
            household_id: currentHousehold.id,
            purchase_id: targetPurchaseId,
            member_id: ca.memberId,
            allocated_eggs: ca.eggs,
            allocated_amount_paise: ca.amountPaise,
            approval_status: isBuyer ? 'accepted' : 'pending',
            accepted_at: isBuyer ? nowIso : undefined,
            paid_amount_paise: isBuyer ? ca.amountPaise : 0,
            pending_confirmation_paise: 0,
            payment_status: isBuyer ? 'Paid' : 'Not Paid',
            updated_at: nowIso
          };
        });

        const allAccepted = newAllocs.every((a) => a.approval_status === 'accepted');

        const newPurchase: Purchase = {
          id: targetPurchaseId,
          household_id: currentHousehold.id,
          purchased_by: buyerId,
          purchase_date: purchaseDate,
          total_eggs: totalEggs,
          total_price_paise: totalPricePaise,
          cost_per_egg_paise: costPerEggPaise,
          notes: purchaseNotes.trim() || `${totalEggs} eggs purchased`,
          allocation_status: allAccepted ? 'finalized' : 'pending_approval',
          version: 1,
          is_deleted: false,
          created_at: nowIso,
          updated_at: nowIso
        };

        nextPurchases = [newPurchase, ...prev.purchases];
        nextAllocations = [...newAllocs, ...prev.purchase_allocations];
      }

      const tempDb: EggMateDatabase = {
        ...prev,
        purchases: nextPurchases,
        purchase_allocations: nextAllocations
      };

      const { batches, logs } = recalculateHouseholdInventoryFIFO(tempDb, currentHousehold.id);

      // Check new available inventory & stop active shortage reminders automatically if sufficient!
      const newAvail = batches
        .filter((b) => b.household_id === currentHousehold.id)
        .reduce((s, b) => s + b.remaining_eggs, 0);

      const updatedNotifs = prev.notifications.map((n) => {
        if (
          n.household_id === currentHousehold.id &&
          n.type === 'shortage_warning' &&
          newAvail > currentSettings.low_stock_threshold
        ) {
          return { ...n, is_active: false };
        }
        return n;
      });

      // Create per-member share notifications
      for (const ca of customAllocations) {
        if (ca.memberId !== buyerId) {
          updatedNotifs.unshift({
            id: uid('notif'),
            household_id: currentHousehold.id,
            target_member_id: ca.memberId,
            type: editingPurchase ? 'allocation_updated' : 'purchase_added',
            title: editingPurchase
              ? `Updated purchase allocation (${ca.eggs} eggs)`
              : `New purchase added. Your share is ${formatINR(ca.amountPaise)}`,
            message: `${buyerName} ${editingPurchase ? 'updated the purchase of' : 'purchased'} ${totalEggs} eggs for ${formatINR(totalPricePaise)}. Your share: ${ca.eggs} eggs (${formatINR(ca.amountPaise)} to pay ${buyerName}). Please review and accept.`,
            dedup_key: `alloc_${targetPurchaseId}_${ca.memberId}_${Date.now()}`,
            is_read_by: [],
            is_active: true,
            created_at: nowIso
          });
        }
      }

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: editingPurchase ? 'audit' : 'purchase',
        message: editingPurchase
          ? `${currentMember.name} modified purchase (${totalEggs} eggs for ${formatINR(totalPricePaise)} by ${buyerName}). Affected members prompted for approval.`
          : `${buyerName} purchased ${totalEggs} eggs for ${formatINR(totalPricePaise)} (${formatINR(costPerEggPaise)}/egg).`,
        created_at: nowIso
      };

      return {
        ...tempDb,
        inventory_batches: batches,
        consumption_logs: logs,
        notifications: updatedNotifs,
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    showToast(
      editingPurchase
        ? 'Purchase & allocations updated! Affected members notified to accept.'
        : `Added ${totalEggs} eggs (${formatINR(totalPricePaise)})! Shortage reminders updated.`
    );
    setEditingPurchase(null);
    setPurchaseNotes('');
    setActiveTab('home');
  };

  // 8.5 Member Accepts Allocated Share
  const handleAcceptAllocation = (allocationId: string) => {
    if (!currentHousehold || !currentMember) return;

    setDb((prev) => {
      const nowIso = new Date().toISOString();
      const targetAlloc = prev.purchase_allocations.find((a) => a.id === allocationId);
      if (!targetAlloc) return prev;

      const updatedAllocations = prev.purchase_allocations.map((a) =>
        a.id === allocationId
          ? {
              ...a,
              approval_status: 'accepted' as ApprovalStatus,
              accepted_at: nowIso,
              updated_at: nowIso
            }
          : a
      );

      const siblings = updatedAllocations.filter((a) => a.purchase_id === targetAlloc.purchase_id);
      const allAccepted = siblings.every((a) => a.approval_status === 'accepted');

      const updatedPurchases = prev.purchases.map((p) =>
        p.id === targetAlloc.purchase_id
          ? {
              ...p,
              allocation_status: (allAccepted ? 'finalized' : 'pending_approval') as 'finalized' | 'pending_approval',
              updated_at: nowIso
            }
          : p
      );

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: 'allocation',
        message: `${currentMember.name} accepted their share of ${targetAlloc.allocated_eggs} eggs (${formatINR(targetAlloc.allocated_amount_paise)}).`,
        created_at: nowIso
      };

      return {
        ...prev,
        purchases: updatedPurchases,
        purchase_allocations: updatedAllocations,
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    showToast('You accepted your egg & cost share!');
  };

  // 8.6 Member Records Payment (Supports single purchase OR FIFO across multiple purchases!)
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold || !currentMember) return;

    const amountPaise = Math.round((parseFloat(payAmountINR) || 0) * 100);
    if (amountPaise <= 0) {
      showToast('Please enter a valid payment amount in ₹.', 'error');
      return;
    }

    if (!payToMemberId || payToMemberId === currentMember.id) {
      showToast('Please select the purchaser you are paying.', 'error');
      return;
    }

    // Find unpaid allocations owed by currentMember to payToMemberId
    const activePurchaseMap = new Map<string, Purchase>();
    for (const p of householdPurchases) {
      if (p.purchased_by === payToMemberId) activePurchaseMap.set(p.id, p);
    }

    const candidateAllocations = householdAllocations
      .filter((a) => {
        if (a.member_id !== currentMember.id) return false;
        if (!activePurchaseMap.has(a.purchase_id)) return false;
        if (payTargetAllocationId !== 'FIFO_ALL' && a.id !== payTargetAllocationId) return false;
        const remainingRequestable = a.allocated_amount_paise - a.paid_amount_paise - a.pending_confirmation_paise;
        return remainingRequestable > 0;
      })
      .sort((a, b) => {
        const pA = activePurchaseMap.get(a.purchase_id)!;
        const pB = activePurchaseMap.get(b.purchase_id)!;
        return pA.purchase_date.localeCompare(pB.purchase_date) || pA.created_at.localeCompare(pB.created_at);
      });

    const totalRequestablePaise = candidateAllocations.reduce(
      (s, a) => s + (a.allocated_amount_paise - a.paid_amount_paise - a.pending_confirmation_paise),
      0
    );

    if (totalRequestablePaise <= 0) {
      showToast('You have no remaining unpaid balance for this selection.', 'error');
      return;
    }

    if (amountPaise > totalRequestablePaise) {
      showToast(
        `Payment amount (${formatINR(amountPaise)}) exceeds your remaining unpaid due (${formatINR(totalRequestablePaise)}).`,
        'error'
      );
      return;
    }

    const receiverName = memberMap.get(payToMemberId)?.name || 'Purchaser';

    setDb((prev) => {
      const nowIso = new Date().toISOString();
      let leftToAllocate = amountPaise;
      const newPaymentRecords: PaymentRecord[] = [];
      const updatedAllocMap = new Map<string, PurchaseAllocation>();

      for (const alloc of candidateAllocations) {
        if (leftToAllocate <= 0) break;
        const unpaid = alloc.allocated_amount_paise - alloc.paid_amount_paise - alloc.pending_confirmation_paise;
        const applyPaise = Math.min(unpaid, leftToAllocate);
        leftToAllocate -= applyPaise;

        const newPending = alloc.pending_confirmation_paise + applyPaise;
        const updatedAlloc: PurchaseAllocation = {
          ...alloc,
          pending_confirmation_paise: newPending,
          payment_status: deriveAllocationPaymentStatus(
            alloc.allocated_amount_paise,
            alloc.paid_amount_paise,
            newPending
          ),
          updated_at: nowIso
        };
        updatedAllocMap.set(alloc.id, updatedAlloc);

        newPaymentRecords.push({
          id: uid('pay'),
          household_id: currentHousehold.id,
          purchase_id: alloc.purchase_id,
          allocation_id: alloc.id,
          from_member_id: currentMember.id,
          to_member_id: payToMemberId,
          amount_paise: applyPaise,
          payment_date: payDate,
          payment_method: payMethod || 'UPI',
          note: payNote.trim() || `Payment to ${receiverName}`,
          status: 'Waiting for Confirmation',
          created_at: nowIso,
          updated_at: nowIso
        });
      }

      const nextAllocations = prev.purchase_allocations.map((a) => updatedAllocMap.get(a.id) || a);

      const newNotifForPurchaser: AppNotification = {
        id: uid('notif'),
        household_id: currentHousehold.id,
        target_member_id: payToMemberId,
        type: 'payment_submitted',
        title: `${currentMember.name} says they paid you ${formatINR(amountPaise)}`,
        message: `${currentMember.name} recorded a payment of ${formatINR(amountPaise)} via ${payMethod}. Please confirm receipt in Payments.`,
        dedup_key: `pay_sub_${Date.now()}`,
        is_read_by: [],
        is_active: true,
        created_at: nowIso
      };

      const newNotifForPayer: AppNotification = {
        id: uid('notif'),
        household_id: currentHousehold.id,
        target_member_id: currentMember.id,
        type: 'payment_submitted',
        title: 'Your payment is waiting for confirmation',
        message: `Your payment of ${formatINR(amountPaise)} to ${receiverName} is marked Waiting for Confirmation.`,
        dedup_key: `pay_wait_${Date.now()}`,
        is_read_by: [currentMember.id],
        is_active: true,
        created_at: nowIso
      };

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: 'payment',
        message: `${currentMember.name} paid ${formatINR(amountPaise)} to ${receiverName} (Waiting for Confirmation).`,
        created_at: nowIso
      };

      return {
        ...prev,
        purchase_allocations: nextAllocations,
        payment_records: [...newPaymentRecords, ...prev.payment_records],
        notifications: [newNotifForPurchaser, newNotifForPayer, ...prev.notifications],
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    setPaymentModalOpen(false);
    setPayAmountINR('');
    setPayNote('');
    showToast(`Recorded ${formatINR(amountPaise)} payment! Waiting for ${receiverName} to confirm receipt.`);
  };

  // 8.7 Purchaser Confirms or Rejects Payment
  const handleConfirmOrRejectPayment = (payment: PaymentRecord, action: 'confirmed' | 'rejected') => {
    if (!currentHousehold || !currentMember) return;
    if (payment.to_member_id !== currentMember.id && !isAdmin) {
      showToast('Only the purchaser who received the payment can confirm it.', 'error');
      return;
    }

    const payerName = memberMap.get(payment.from_member_id)?.name || 'Member';
    const receiverName = memberMap.get(payment.to_member_id)?.name || currentMember.name;

    setDb((prev) => {
      const nowIso = new Date().toISOString();
      const updatedPayments = prev.payment_records.map((p) =>
        p.id === payment.id
          ? {
              ...p,
              status: (action === 'confirmed' ? 'Confirmed' : 'Rejected') as PaymentRecordStatus,
              updated_at: nowIso
            }
          : p
      );

      const updatedAllocations = prev.purchase_allocations.map((a) => {
        if (a.id !== payment.allocation_id) return a;
        const nextPending = Math.max(0, a.pending_confirmation_paise - payment.amount_paise);
        const nextPaid =
          action === 'confirmed'
            ? Math.min(a.allocated_amount_paise, a.paid_amount_paise + payment.amount_paise)
            : a.paid_amount_paise;
        return {
          ...a,
          paid_amount_paise: nextPaid,
          pending_confirmation_paise: nextPending,
          payment_status: deriveAllocationPaymentStatus(a.allocated_amount_paise, nextPaid, nextPending),
          updated_at: nowIso
        };
      });

      const newConfirmation: PaymentConfirmation = {
        id: uid('conf'),
        household_id: currentHousehold.id,
        payment_record_id: payment.id,
        confirmed_by: currentMember.id,
        action,
        reason:
          action === 'confirmed'
            ? `Confirmed receiving ${formatINR(payment.amount_paise)}`
            : `Payment of ${formatINR(payment.amount_paise)} was not received`,
        confirmed_at: nowIso
      };

      const targetAllocAfter = updatedAllocations.find((a) => a.id === payment.allocation_id);
      const remAfter = targetAllocAfter
        ? Math.max(0, targetAllocAfter.allocated_amount_paise - targetAllocAfter.paid_amount_paise)
        : 0;

      const notifForPayer: AppNotification = {
        id: uid('notif'),
        household_id: currentHousehold.id,
        target_member_id: payment.from_member_id,
        type: action === 'confirmed' ? 'payment_confirmed' : 'payment_rejected',
        title:
          action === 'confirmed'
            ? `${receiverName} confirmed receiving your payment`
            : `${receiverName} rejected your payment entry`,
        message:
          action === 'confirmed'
            ? `${receiverName} confirmed receiving ${formatINR(payment.amount_paise)}. Your remaining balance for that purchase is ${formatINR(remAfter)}.`
            : `${receiverName} marked your ${formatINR(payment.amount_paise)} payment as not received. Your balance remains due.`,
        dedup_key: `conf_notif_${payment.id}_${action}`,
        is_read_by: [],
        is_active: true,
        created_at: nowIso
      };

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: 'payment',
        message:
          action === 'confirmed'
            ? `${receiverName} confirmed receiving ${formatINR(payment.amount_paise)} from ${payerName}.`
            : `${receiverName} rejected ${formatINR(payment.amount_paise)} payment record from ${payerName}.`,
        created_at: nowIso
      };

      return {
        ...prev,
        purchase_allocations: updatedAllocations,
        payment_records: updatedPayments,
        payment_confirmations: [newConfirmation, ...prev.payment_confirmations],
        notifications: [notifForPayer, ...prev.notifications],
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    showToast(
      action === 'confirmed'
        ? `Confirmed receiving ${formatINR(payment.amount_paise)} from ${payerName}!`
        : `Rejected ${formatINR(payment.amount_paise)} payment from ${payerName}.`,
      action === 'confirmed' ? 'success' : 'info'
    );
  };

  // 8.8 Update Member Weekly Consumption Schedule
  const handleUpdateSchedule = (
    memberId: string,
    dayKey: keyof Pick<MemberSchedule, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>,
    val: number
  ) => {
    if (!currentHousehold || !currentMember) return;
    const clamped = Math.max(0, Math.min(24, Math.round(val)));

    setDb((prev) => {
      const nowIso = new Date().toISOString();
      const exists = prev.member_schedules.some(
        (s) => s.household_id === currentHousehold.id && s.member_id === memberId
      );
      let nextSchedules: MemberSchedule[];
      if (exists) {
        nextSchedules = prev.member_schedules.map((s) =>
          s.household_id === currentHousehold.id && s.member_id === memberId
            ? { ...s, [dayKey]: clamped, updated_at: nowIso }
            : s
        );
      } else {
        nextSchedules = [
          ...prev.member_schedules,
          {
            id: uid('sched'),
            household_id: currentHousehold.id,
            member_id: memberId,
            mon: 2,
            tue: 2,
            wed: 2,
            thu: 2,
            fri: 2,
            sat: 0,
            sun: 0,
            [dayKey]: clamped,
            updated_at: nowIso
          }
        ];
      }
      return {
        ...prev,
        member_schedules: nextSchedules
      };
    });
  };

  // 8.9 Add New Member & Increase Room Capacity (Included in future purchases by default, zero historical debt)
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold || !currentMember) return;
    const cleanName = newMemberName.trim();
    if (!cleanName) {
      showToast('Please enter the member name.', 'error');
      return;
    }

    const newMemId = uid('mem');
    const nowIso = new Date().toISOString();

    setDb((prev) => {
      const newMember: HouseholdMember = {
        id: newMemId,
        household_id: currentHousehold.id,
        name: cleanName,
        avatar: newMemberAvatar,
        role: 'member',
        status: 'active',
        default_daily_eggs: newMemberDailyEggs,
        joined_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso
      };

      const newSched: MemberSchedule = {
        id: uid('sched'),
        household_id: currentHousehold.id,
        member_id: newMemId,
        mon: newMemberDailyEggs,
        tue: newMemberDailyEggs,
        wed: newMemberDailyEggs,
        thu: newMemberDailyEggs,
        fri: newMemberDailyEggs,
        sat: 0,
        sun: 0,
        updated_at: nowIso
      };

      const updatedRoomMembersCount =
        prev.household_members.filter((m) => m.household_id === currentHousehold.id && m.status === 'active').length + 1;

      const nextHouseholds = prev.households.map((h) =>
        h.id === currentHousehold.id
          ? {
              ...h,
              expected_member_count: Math.max(h.expected_member_count, updatedRoomMembersCount),
              updated_at: nowIso
            }
          : h
      );

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: 'member',
        message: `${currentMember.name} added ${cleanName} to ${currentHousehold.name} (active members: ${updatedRoomMembersCount}).`,
        created_at: nowIso
      };

      return {
        ...prev,
        households: nextHouseholds,
        household_members: [...prev.household_members, newMember],
        member_schedules: [...prev.member_schedules, newSched],
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    setNewMemberName('');
    showToast(`Added ${cleanName} to the household! Future purchases & predictions updated automatically.`);
  };

  // Quick 1-Tap Increase Roommates (+1 or +N members)
  const handleQuickIncreaseMembers = (countToAdd = 1) => {
    if (!currentHousehold || !currentMember) return;
    const nowIso = new Date().toISOString();
    const startNumber = householdMembers.length + 1;
    const createdNames: string[] = [];

    setDb((prev) => {
      const addedMembers: HouseholdMember[] = [];
      const addedSchedules: MemberSchedule[] = [];

      for (let i = 0; i < countToAdd; i++) {
        const num = startNumber + i;
        const mId = uid('mem');
        const mName = `Member ${num}`;
        const av = AVATAR_OPTIONS[(num - 1) % AVATAR_OPTIONS.length];
        createdNames.push(mName);

        addedMembers.push({
          id: mId,
          household_id: currentHousehold.id,
          name: mName,
          avatar: av,
          role: 'member',
          status: 'active',
          default_daily_eggs: 2,
          joined_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso
        });

        addedSchedules.push({
          id: uid('sched'),
          household_id: currentHousehold.id,
          member_id: mId,
          mon: 2,
          tue: 2,
          wed: 2,
          thu: 2,
          fri: 2,
          sat: 0,
          sun: 0,
          updated_at: nowIso
        });
      }

      const newActiveTotal =
        prev.household_members.filter((m) => m.household_id === currentHousehold.id && m.status === 'active').length +
        countToAdd;

      const nextHouseholds = prev.households.map((h) =>
        h.id === currentHousehold.id
          ? {
              ...h,
              expected_member_count: Math.max(h.expected_member_count, newActiveTotal),
              updated_at: nowIso
            }
          : h
      );

      const newActivity: ActivityLog = {
        id: uid('act'),
        household_id: currentHousehold.id,
        actor_member_id: currentMember.id,
        category: 'member',
        message: `${currentMember.name} increased household members by ${countToAdd} (${createdNames.join(', ')}). Total active roommates: ${newActiveTotal}.`,
        created_at: nowIso
      };

      return {
        ...prev,
        households: nextHouseholds,
        household_members: [...prev.household_members, ...addedMembers],
        member_schedules: [...prev.member_schedules, ...addedSchedules],
        activity_logs: [newActivity, ...prev.activity_logs]
      };
    });

    showToast(`Added ${createdNames.join(', ')}! Room now has ${activeMembers.length + countToAdd} active members.`);
  };

  // Update Room Expected Member Capacity
  const handleUpdateRoomCapacity = (nextCapacity: number) => {
    if (!currentHousehold) return;
    const clamped = Math.max(activeMembers.length, Math.min(30, Math.round(nextCapacity)));
    const nowIso = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      households: prev.households.map((h) =>
        h.id === currentHousehold.id ? { ...h, expected_member_count: clamped, updated_at: nowIso } : h
      )
    }));
    showToast(`Updated room capacity target to ${clamped} roommates.`, 'info');
  };

  // Edit Existing Member Name / Avatar / Daily Default
  const handleSaveEditedMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold || !currentMember || !editingMember) return;
    const cleanName = editingMember.name.trim();
    if (!cleanName) {
      showToast('Member name cannot be empty.', 'error');
      return;
    }
    const nowIso = new Date().toISOString();
    setDb((prev) => ({
      ...prev,
      household_members: prev.household_members.map((m) =>
        m.id === editingMember.id
          ? {
              ...m,
              name: cleanName,
              avatar: editingMember.avatar,
              role: editingMember.role,
              default_daily_eggs: editingMember.default_daily_eggs,
              updated_at: nowIso
            }
          : m
      ),
      activity_logs: [
        {
          id: uid('act'),
          household_id: currentHousehold.id,
          actor_member_id: currentMember.id,
          category: 'member',
          message: `${currentMember.name} updated profile details for ${cleanName}.`,
          created_at: nowIso
        },
        ...prev.activity_logs
      ]
    }));
    setEditingMember(null);
    showToast(`Updated profile for ${cleanName}!`);
  };

  // Optional 1-Click Re-split Latest Purchase Among All Current Active Members
  const handleResplitLatestPurchaseWithAllActive = () => {
    if (!currentHousehold || !currentMember || householdPurchases.length === 0) return;
    const latestPurchase = householdPurchases[0];
    const nowIso = new Date().toISOString();
    const equalShares = computeEqualSplit(
      latestPurchase.total_eggs,
      latestPurchase.total_price_paise,
      activeMembers.map((m) => m.id)
    );

    setDb((prev) => {
      const existingAllocs = prev.purchase_allocations.filter((a) => a.purchase_id === latestPurchase.id);
      const updatedAllocs: PurchaseAllocation[] = equalShares.map((share) => {
        const oldAlloc = existingAllocs.find((a) => a.member_id === share.memberId);
        const isBuyer = share.memberId === latestPurchase.purchased_by;
        const paidPaise = isBuyer ? share.amountPaise : oldAlloc ? oldAlloc.paid_amount_paise : 0;
        const pendingPaise = isBuyer ? 0 : oldAlloc ? oldAlloc.pending_confirmation_paise : 0;

        return {
          id: oldAlloc ? oldAlloc.id : uid('alloc'),
          household_id: currentHousehold.id,
          purchase_id: latestPurchase.id,
          member_id: share.memberId,
          allocated_eggs: share.eggs,
          allocated_amount_paise: share.amountPaise,
          approval_status: isBuyer ? 'accepted' : 'pending',
          accepted_at: isBuyer ? nowIso : undefined,
          paid_amount_paise: paidPaise,
          pending_confirmation_paise: pendingPaise,
          payment_status: deriveAllocationPaymentStatus(share.amountPaise, paidPaise, pendingPaise),
          updated_at: nowIso
        };
      });

      const otherAllocs = prev.purchase_allocations.filter((a) => a.purchase_id !== latestPurchase.id);

      return {
        ...prev,
        purchases: prev.purchases.map((p) =>
          p.id === latestPurchase.id
            ? { ...p, allocation_status: 'pending_approval', version: p.version + 1, updated_at: nowIso }
            : p
        ),
        purchase_allocations: [...updatedAllocs, ...otherAllocs],
        activity_logs: [
          {
            id: uid('act'),
            household_id: currentHousehold.id,
            actor_member_id: currentMember.id,
            category: 'allocation',
            message: `${currentMember.name} re-split the ${latestPurchase.total_eggs}-egg purchase equally across all ${activeMembers.length} active members.`,
            created_at: nowIso
          },
          ...prev.activity_logs
        ]
      };
    });

    showToast(`Re-split ${latestPurchase.total_eggs} eggs equally across all ${activeMembers.length} active members!`);
  };

  // 8.10 Member Leaves / Settle Remaining Dues
  const handleToggleMemberStatus = (mem: HouseholdMember) => {
    if (!currentHousehold || !currentMember || !isAdmin) return;
    if (mem.id === currentMember.id) {
      showToast('Admin cannot remove themselves while logged in.', 'error');
      return;
    }

    const nextStatus: MemberStatus = mem.status === 'active' ? 'left' : 'active';
    const nowIso = new Date().toISOString();

    setDb((prev) => ({
      ...prev,
      household_members: prev.household_members.map((m) =>
        m.id === mem.id
          ? {
              ...m,
              status: nextStatus,
              left_at: nextStatus === 'left' ? nowIso : undefined,
              updated_at: nowIso
            }
          : m
      ),
      activity_logs: [
        {
          id: uid('act'),
          household_id: currentHousehold.id,
          actor_member_id: currentMember.id,
          category: 'member',
          message:
            nextStatus === 'left'
              ? `${mem.name} was marked as left by ${currentMember.name}. Historical records and outstanding balances preserved.`
              : `${mem.name} was reactivated in the room by ${currentMember.name}.`,
          created_at: nowIso
        },
        ...prev.activity_logs
      ]
    }));

    showToast(
      nextStatus === 'left'
        ? `${mem.name} marked as left. Historical records & balances preserved.`
        : `${mem.name} is active again.`
    );
  };

  const handleAdminSettleMemberDues = (mem: HouseholdMember) => {
    if (!currentHousehold || !currentMember || !isAdmin) return;
    const nowIso = new Date().toISOString();

    setDb((prev) => {
      const updatedAllocations = prev.purchase_allocations.map((a) => {
        if (a.household_id === currentHousehold.id && a.member_id === mem.id && a.paid_amount_paise < a.allocated_amount_paise) {
          return {
            ...a,
            paid_amount_paise: a.allocated_amount_paise,
            pending_confirmation_paise: 0,
            payment_status: 'Paid' as PaymentStatusLabel,
            approval_status: 'accepted' as ApprovalStatus,
            updated_at: nowIso
          };
        }
        return a;
      });

      return {
        ...prev,
        purchase_allocations: updatedAllocations,
        activity_logs: [
          {
            id: uid('act'),
            household_id: currentHousehold.id,
            actor_member_id: currentMember.id,
            category: 'audit',
            message: `Admin ${currentMember.name} settled and closed all remaining financial dues for ${mem.name}.`,
            created_at: nowIso
          },
          ...prev.activity_logs
        ]
      };
    });

    showToast(`Settled and closed all outstanding dues for ${mem.name}.`);
  };

  // 8.11 Create a New Household Room
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const rName = newRoomName.trim();
    const aName = newRoomAdminName.trim();
    if (!rName || !aName || !newRoomPin.trim()) {
      showToast('Please fill in Room Name, Your Name, and Household PIN.', 'error');
      return;
    }

    const hId = uid('hh');
    const adminId = uid('mem');
    const code = `EGG-${Math.floor(100 + Math.random() * 900)}`;
    const nowIso = new Date().toISOString();

    const newHousehold: Household = {
      id: hId,
      room_code: code,
      name: rName,
      pin_code: newRoomPin.trim(),
      expected_member_count: Math.max(1, newRoomCount),
      created_by: adminId,
      created_at: nowIso,
      updated_at: nowIso
    };

    const adminMember: HouseholdMember = {
      id: adminId,
      household_id: hId,
      name: aName,
      avatar: newRoomAvatar,
      role: 'admin',
      status: 'active',
      default_daily_eggs: newRoomDefaultEggs,
      joined_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso
    };

    const adminSched: MemberSchedule = {
      id: uid('sched'),
      household_id: hId,
      member_id: adminId,
      mon: newRoomDefaultEggs,
      tue: newRoomDefaultEggs,
      wed: newRoomDefaultEggs,
      thu: newRoomDefaultEggs,
      fri: newRoomDefaultEggs,
      sat: 0,
      sun: 0,
      updated_at: nowIso
    };

    const settings: HouseholdSettings = {
      id: uid('set'),
      household_id: hId,
      low_stock_threshold: 8,
      reminder_lead_days: 3,
      prediction_mode: 'schedule',
      browser_notifications_enabled: false,
      updated_at: nowIso
    };

    setDb((prev) => ({
      ...prev,
      households: [newHousehold, ...prev.households],
      household_members: [...prev.household_members, adminMember],
      member_schedules: [...prev.member_schedules, adminSched],
      household_settings: [...prev.household_settings, settings],
      activity_logs: [
        {
          id: uid('act'),
          household_id: hId,
          actor_member_id: adminId,
          category: 'settings',
          message: `${aName} created household room "${rName}" (Room Code: ${code}).`,
          created_at: nowIso
        },
        ...prev.activity_logs
      ]
    }));

    setSession({ householdId: hId, memberId: adminId });
    setRoomSwitcherOpen(false);
    setNewRoomName('');
    setNewRoomAdminName('');
    showToast(`Created room "${rName}" (Code: ${code})! You are the Admin.`);
  };

  // 8.12 Join an Existing Household Room via Room Code + PIN
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinRoomCode.trim().toUpperCase();
    const pin = joinRoomPin.trim();
    const mName = joinMemberName.trim();

    const targetRoom = db.households.find((h) => h.room_code.toUpperCase() === code);
    if (!targetRoom) {
      showToast(`No household found with Room Code "${code}".`, 'error');
      return;
    }
    if (targetRoom.pin_code !== pin) {
      showToast('Incorrect Household Access PIN.', 'error');
      return;
    }
    if (!mName) {
      showToast('Please enter your name.', 'error');
      return;
    }

    // Check if member with same name already exists in that room
    const existingMember = db.household_members.find(
      (m) => m.household_id === targetRoom.id && m.name.toLowerCase() === mName.toLowerCase()
    );

    if (existingMember) {
      setSession({ householdId: targetRoom.id, memberId: existingMember.id });
      setRoomSwitcherOpen(false);
      showToast(`Welcome back to ${targetRoom.name}, ${existingMember.name}!`);
      return;
    }

    const newMemId = uid('mem');
    const nowIso = new Date().toISOString();

    setDb((prev) => ({
      ...prev,
      household_members: [
        ...prev.household_members,
        {
          id: newMemId,
          household_id: targetRoom.id,
          name: mName,
          avatar: joinAvatar,
          role: 'member',
          status: 'active',
          default_daily_eggs: 2,
          joined_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso
        }
      ],
      member_schedules: [
        ...prev.member_schedules,
        {
          id: uid('sched'),
          household_id: targetRoom.id,
          member_id: newMemId,
          mon: 2,
          tue: 2,
          wed: 2,
          thu: 2,
          fri: 2,
          sat: 0,
          sun: 0,
          updated_at: nowIso
        }
      ],
      activity_logs: [
        {
          id: uid('act'),
          household_id: targetRoom.id,
          actor_member_id: newMemId,
          category: 'member',
          message: `${mName} joined ${targetRoom.name} via Room Code.`,
          created_at: nowIso
        },
        ...prev.activity_logs
      ]
    }));

    setSession({ householdId: targetRoom.id, memberId: newMemId });
    setRoomSwitcherOpen(false);
    setJoinMemberName('');
    showToast(`Joined ${targetRoom.name} as ${mName}!`);
  };

  // 8.13 CSV Export Utility
  const handleExportCSV = (exportType: 'purchases' | 'consumption' | 'payments' | 'summary') => {
    if (!currentHousehold) return;
    let csv = '';
    let filename = `eggmate_${currentHousehold.room_code.toLowerCase()}_${exportType}.csv`;

    if (exportType === 'purchases') {
      csv = 'Purchase Date,Purchased By,Total Eggs,Total Price (INR),Cost Per Egg (INR),Allocation Status,Notes\n';
      for (const p of householdPurchases) {
        const buyer = memberMap.get(p.purchased_by)?.name || 'Unknown';
        csv += `"${formatDateIN(p.purchase_date)}","${buyer}",${p.total_eggs},${(p.total_price_paise / 100).toFixed(2)},${(p.cost_per_egg_paise / 100).toFixed(2)},"${p.allocation_status}","${p.notes.replace(/"/g, '""')}"\n`;
      }
    } else if (exportType === 'consumption') {
      csv = 'Date,Member,Type,Eggs Count,FIFO Value (INR),Description,Recorded At\n';
      for (const c of householdConsumption) {
        const mem = memberMap.get(c.member_id)?.name || 'Unknown';
        csv += `"${formatDateIN(c.consumption_date)}","${mem}","${c.log_type}",${c.eggs_count},${(c.fifo_cost_paise / 100).toFixed(2)},"${c.description.replace(/"/g, '""')}","${formatDateTimeIN(c.created_at)}"\n`;
      }
    } else if (exportType === 'payments') {
      csv = 'Payment Date,From Member,To Purchaser,Amount (INR),Method,Status,Note\n';
      for (const pay of householdPayments) {
        const fromM = memberMap.get(pay.from_member_id)?.name || 'Unknown';
        const toM = memberMap.get(pay.to_member_id)?.name || 'Unknown';
        csv += `"${formatDateIN(pay.payment_date)}","${fromM}","${toM}",${(pay.amount_paise / 100).toFixed(2)},"${pay.payment_method}","${pay.status}","${pay.note.replace(/"/g, '""')}"\n`;
      }
    } else {
      csv = 'Member,Role,Status,Eggs Consumed,FIFO Consumption Value (INR),Allocated Eggs,Purchase Share (INR),Confirmed Paid (INR),Remaining Due (INR),Waiting to Receive (INR)\n';
      for (const s of memberSummaries) {
        csv += `"${s.member.name}","${s.member.role}","${s.member.status}",${s.eggsUsed},${(s.fifoConsumptionValuePaise / 100).toFixed(2)},${s.allocatedEggs},${(s.purchaseSharePaise / 100).toFixed(2)},${(s.confirmedPaidPaise / 100).toFixed(2)},${(s.remainingDuePaise / 100).toFixed(2)},${(s.waitingToReceiveFromOthersPaise / 100).toFixed(2)}\n`;
      }
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename} successfully!`);
  };

  // 8.14 Scenario Preset Loaders (Section 18 + Multi-Purchase FIFO)
  const handleLoadSection18Scenario = () => {
    const fresh = buildSection18SeedDatabase();
    setDb(fresh);
    setSession({ householdId: 'hh_sunrise_302', memberId: 'mem_mahesh' });
    showToast('Loaded Section 18 Final Testing Scenario (Mahesh + 3 roommates, 40 eggs @ ₹280, 32 left, ₹50 paid).');
  };

  const handleLoadMultiPurchaseScenario = () => {
    const base = buildSection18SeedDatabase();
    const p2Id = 'pur_thursday_40';
    const nowIso = '2026-11-11T10:00:00.000Z';
    // Add Purchase 2: ₹320 (40 eggs @ ₹8/egg), split ₹80 per person
    base.purchases.unshift({
      id: p2Id,
      household_id: 'hh_sunrise_302',
      purchased_by: 'mem_mahesh',
      purchase_date: '2026-11-11',
      total_eggs: 40,
      total_price_paise: 32000,
      cost_per_egg_paise: 800,
      notes: 'Second tray at ₹8/egg (Multi-purchase test)',
      allocation_status: 'finalized',
      version: 1,
      is_deleted: false,
      created_at: nowIso,
      updated_at: nowIso
    });
    const members = ['mem_mahesh', 'mem_member2', 'mem_member3', 'mem_member4'];
    for (const mId of members) {
      const isBuyer = mId === 'mem_mahesh';
      base.purchase_allocations.push({
        id: `alloc_p2_${mId}`,
        household_id: 'hh_sunrise_302',
        purchase_id: p2Id,
        member_id: mId,
        allocated_eggs: 10,
        allocated_amount_paise: 8000,
        approval_status: 'accepted',
        accepted_at: nowIso,
        paid_amount_paise: isBuyer ? 8000 : 0,
        pending_confirmation_paise: 0,
        payment_status: isBuyer ? 'Paid' : 'Not Paid',
        updated_at: nowIso
      });
    }
    const { batches, logs } = recalculateHouseholdInventoryFIFO(base, 'hh_sunrise_302');
    base.inventory_batches = batches;
    base.consumption_logs = logs;
    setDb(base);
    setSession({ householdId: 'hh_sunrise_302', memberId: 'mem_member2' });
    showToast('Loaded Multi-Purchase Scenario (Purchase 1: ₹280 + Purchase 2: ₹320). Switched to Member 2!');
  };

  // Clear all demo purchases, consumption, payments & alerts while keeping current room & members
  const handleClearDemoRecordsKeepRoom = async () => {
    if (!currentHousehold || !currentMember) return;
    const nowIso = new Date().toISOString();
    const cleanedDb: EggMateDatabase = {
      ...db,
      purchases: db.purchases.filter((p) => p.household_id !== currentHousehold.id),
      inventory_batches: db.inventory_batches.filter((b) => b.household_id !== currentHousehold.id),
      purchase_allocations: db.purchase_allocations.filter((a) => a.household_id !== currentHousehold.id),
      consumption_logs: db.consumption_logs.filter((c) => c.household_id !== currentHousehold.id),
      payment_records: db.payment_records.filter((p) => p.household_id !== currentHousehold.id),
      payment_confirmations: db.payment_confirmations.filter((c) => c.household_id !== currentHousehold.id),
      notifications: [],
      activity_logs: [
        {
          id: uid('act'),
          household_id: currentHousehold.id,
          actor_member_id: currentMember.id,
          category: 'audit',
          message: `${currentMember.name} cleared all demo records to start fresh (0 eggs, ₹0 balance).`,
          created_at: nowIso
        }
      ]
    };

    setDb(cleanedDb);
    setResetModalOpen(false);
    showToast('Cleared all demo data! Your room is now fresh at 0 eggs and ₹0 balance.');

    const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
    const cleanKey = supabaseAnonKey.trim();
    if (cleanUrl && cleanKey) {
      try {
        const pushEndpoint = new URL('/rest/v1/eggmate_cloud_state?on_conflict=room_code', cleanUrl);
        await fetch(pushEndpoint.toString(), {
          method: 'POST',
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            room_code: currentHousehold.room_code,
            household_id: currentHousehold.id,
            payload_json: cleanedDb,
            updated_at: nowIso
          })
        });
      } catch {
        // ignore network error
      }
    }
  };

  // Full Factory Reset: Delete Demo Room completely & open Create New Room screen
  const handleFullFactoryReset = async () => {
    const oldRoomCode = currentHousehold?.room_code;
    const emptyDb: EggMateDatabase = {
      households: [],
      household_members: [],
      member_schedules: [],
      household_settings: [],
      purchases: [],
      inventory_batches: [],
      purchase_allocations: [],
      consumption_logs: [],
      payment_records: [],
      payment_confirmations: [],
      notifications: [],
      activity_logs: []
    };

    setDb(emptyDb);
    setSession(null);
    setAuthTab('create');
    setResetModalOpen(false);
    showToast('Removed all demo rooms and data! Create your new household room below.', 'info');

    const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
    const cleanKey = supabaseAnonKey.trim();
    if (cleanUrl && cleanKey && oldRoomCode) {
      try {
        const delEndpoint = new URL(
          `/rest/v1/eggmate_cloud_state?room_code=eq.${encodeURIComponent(oldRoomCode)}`,
          cleanUrl
        );
        await fetch(delEndpoint.toString(), {
          method: 'DELETE',
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`
          }
        });
      } catch {
        // ignore
      }
    }
  };

  // 8.15 Live Supabase PostgreSQL REST Sync (Zero-Backend Browser Sync)
  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
    const cleanKey = supabaseAnonKey.trim();
    try {
      localStorage.setItem('eggmate_supabase_url', cleanUrl);
      localStorage.setItem('eggmate_supabase_anon_key', cleanKey);
    } catch {
      // ignore
    }
    setSupabaseUrl(cleanUrl);
    setSupabaseAnonKey(cleanKey);
    showToast(cleanUrl && cleanKey ? 'Saved Supabase URL & Anon Key!' : 'Cleared Supabase credentials.', 'info');
  };

  const handlePushToSupabase = async () => {
    const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
    const cleanKey = supabaseAnonKey.trim();
    if (!cleanUrl || !cleanKey || !currentHousehold) {
      showToast('Enter your Supabase Project URL and Anon Key first.', 'error');
      return;
    }
    setCloudSyncStatus('syncing');
    try {
      const res = await fetch(new URL('/rest/v1/eggmate_cloud_state?on_conflict=room_code', cleanUrl).toString(), {
        method: 'POST',
        headers: {
          apikey: cleanKey,
          Authorization: `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          room_code: currentHousehold.room_code,
          household_id: currentHousehold.id,
          payload_json: db,
          updated_at: new Date().toISOString()
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setCloudSyncStatus('synced');
      showToast(`Synced room ${currentHousehold.room_code} to Supabase PostgreSQL!`);
    } catch {
      setCloudSyncStatus('error');
      showToast('Could not reach Supabase table. Make sure you ran the SQL script in Supabase SQL Editor.', 'error');
    }
  };

  const handlePullFromSupabase = async () => {
    const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
    const cleanKey = supabaseAnonKey.trim();
    if (!cleanUrl || !cleanKey || !currentHousehold) {
      showToast('Enter your Supabase Project URL and Anon Key first.', 'error');
      return;
    }
    setCloudSyncStatus('syncing');
    try {
      const pullEndpoint = new URL(`/rest/v1/eggmate_cloud_state?room_code=eq.${encodeURIComponent(currentHousehold.room_code)}&select=payload_json`, cleanUrl);
      const res = await fetch(
        pullEndpoint.toString(),
        {
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`
          }
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].payload_json) {
        setDb(rows[0].payload_json);
        setCloudSyncStatus('synced');
        showToast(`Loaded latest household state for ${currentHousehold.room_code} from Supabase!`);
      } else {
        setCloudSyncStatus('idle');
        showToast('No cloud snapshot found for this room code yet — click Push to Supabase first.', 'info');
      }
    } catch {
      setCloudSyncStatus('error');
      showToast('Failed to fetch from Supabase. Verify URL, Anon Key, and SQL table setup.', 'error');
    }
  };

  // Automatic initial pull from Supabase on mount, then auto-push whenever db mutates
  useEffect(() => {
    const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
    const cleanKey = supabaseAnonKey.trim();
    const roomCode = currentHousehold?.room_code;
    if (!cleanUrl || !cleanKey || !roomCode || initialCloudPullDoneRef.current) return;
    initialCloudPullDoneRef.current = true;

    const syncOnMount = async () => {
      setCloudSyncStatus('syncing');
      try {
        const pullEndpoint = new URL(
          `/rest/v1/eggmate_cloud_state?room_code=eq.${encodeURIComponent(roomCode)}&select=payload_json`,
          cleanUrl
        );
        const res = await fetch(pullEndpoint.toString(), {
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`
          }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].payload_json) {
          setDb(rows[0].payload_json);
          setCloudSyncStatus('synced');
        } else {
          // Seed initial room state into Supabase
          const pushEndpoint = new URL('/rest/v1/eggmate_cloud_state?on_conflict=room_code', cleanUrl);
          const pushRes = await fetch(pushEndpoint.toString(), {
            method: 'POST',
            headers: {
              apikey: cleanKey,
              Authorization: `Bearer ${cleanKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
              room_code: roomCode,
              household_id: currentHousehold.id,
              payload_json: db,
              updated_at: new Date().toISOString()
            })
          });
          setCloudSyncStatus(pushRes.ok ? 'synced' : 'error');
        }
      } catch {
        setCloudSyncStatus('error');
      }
    };
    syncOnMount();
  }, [supabaseUrl, supabaseAnonKey, currentHousehold?.room_code]);

  // Debounced auto-push to Supabase whenever db changes after initial sync
  useEffect(() => {
    if (!initialCloudPullDoneRef.current) return;
    const cleanUrl = supabaseUrl.trim().replace(/\/$/, '');
    const cleanKey = supabaseAnonKey.trim();
    if (!cleanUrl || !cleanKey || !currentHousehold) return;

    const timer = setTimeout(async () => {
      setCloudSyncStatus('syncing');
      try {
        const pushEndpoint = new URL('/rest/v1/eggmate_cloud_state?on_conflict=room_code', cleanUrl);
        const res = await fetch(pushEndpoint.toString(), {
          method: 'POST',
          headers: {
            apikey: cleanKey,
            Authorization: `Bearer ${cleanKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            room_code: currentHousehold.room_code,
            household_id: currentHousehold.id,
            payload_json: db,
            updated_at: new Date().toISOString()
          })
        });
        setCloudSyncStatus(res.ok ? 'synced' : 'error');
      } catch {
        setCloudSyncStatus('error');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [db, supabaseUrl, supabaseAnonKey, currentHousehold?.room_code]);

  const handleCopySqlSchema = () => {
    const sqlText = `-- Paste & Run this in Supabase SQL Editor (https://supabase.com/dashboard)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.eggmate_cloud_state (
  room_code VARCHAR(32) PRIMARY KEY,
  household_id TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.eggmate_cloud_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_anon_room_sync ON public.eggmate_cloud_state;
CREATE POLICY allow_anon_room_sync ON public.eggmate_cloud_state
  FOR ALL USING (true) WITH CHECK (true);`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(sqlText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = sqlText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Copied Supabase SQL script to clipboard! Paste it into Supabase SQL Editor and click Run.');
    } catch {
      showToast('Select and copy the SQL from the inspector panel below.', 'info');
    }
  };

  // ============================================================================
  // 9. FILTERED REPORT DATA & CHARTS
  // ============================================================================

  const filteredReportData = useMemo(() => {
    let start = '2000-01-01';
    let end = '2099-12-31';
    if (reportFilter === 'week') {
      start = '2026-11-08';
      end = '2026-11-15';
    } else if (reportFilter === 'month') {
      start = '2026-11-01';
      end = '2026-11-30';
    } else if (reportFilter === 'last_month') {
      start = '2026-10-01';
      end = '2026-10-31';
    } else if (reportFilter === 'custom') {
      start = customStartDate || '2000-01-01';
      end = customEndDate || '2099-12-31';
    }

    const fPurchases = householdPurchases.filter((p) => p.purchase_date >= start && p.purchase_date <= end);
    const fLogs = householdConsumption.filter((c) => c.consumption_date >= start && c.consumption_date <= end);
    const fPurchaseIds = new Set(fPurchases.map((p) => p.id));
    const fAllocations = householdAllocations.filter((a) => fPurchaseIds.has(a.purchase_id));

    const eggsBought = fPurchases.reduce((s, p) => s + p.total_eggs, 0);
    const purchaseAmountPaise = fPurchases.reduce((s, p) => s + p.total_price_paise, 0);
    const eggsConsumed = fLogs.filter((l) => l.log_type === 'consumption').reduce((s, l) => s + l.eggs_count, 0);
    const wasteQty = fLogs.filter((l) => l.log_type === 'waste').reduce((s, l) => s + l.eggs_count, 0);
    const wasteExpensePaise = fLogs.filter((l) => l.log_type === 'waste').reduce((s, l) => s + l.fifo_cost_paise, 0);

    const memberBarData = householdMembers.map((m) => {
      const mUsed = fLogs
        .filter((l) => l.member_id === m.id && l.log_type === 'consumption')
        .reduce((s, l) => s + l.eggs_count, 0);
      const mAllocs = fAllocations.filter((a) => a.member_id === m.id);
      const mAllocEggs = mAllocs.reduce((s, a) => s + a.allocated_eggs, 0);
      const mShareINR = Number((mAllocs.reduce((s, a) => s + a.allocated_amount_paise, 0) / 100).toFixed(2));
      const mPaidINR = Number((mAllocs.reduce((s, a) => s + a.paid_amount_paise, 0) / 100).toFixed(2));
      const mDueINR = Number(Math.max(0, mShareINR - mPaidINR).toFixed(2));

      return {
        name: m.name,
        Consumed: mUsed,
        Allocated: mAllocEggs,
        ShareINR: mShareINR,
        PaidINR: mPaidINR,
        DueINR: mDueINR
      };
    });

    const dailyTrendData = prediction.forecastRows.map((row) => ({
      day: `${row.dayName.slice(0, 3)} (${formatDateIN(row.date).slice(0, 5)})`,
      EggsUsedOrPlanned: row.eggsConsumedOrPlanned,
      RemainingInventory: row.remainingAfter
    }));

    return {
      eggsBought,
      purchaseAmountPaise,
      eggsConsumed,
      wasteQty,
      wasteExpensePaise,
      memberBarData,
      dailyTrendData
    };
  }, [
    reportFilter,
    customStartDate,
    customEndDate,
    householdPurchases,
    householdConsumption,
    householdAllocations,
    householdMembers,
    prediction.forecastRows
  ]);

  // If no active session or user logged out, show full Authentication & Room Selection Screen
  if (!session || !currentHousehold || !currentMember) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 font-sans">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-emerald-100 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Egg className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">EggMate</h1>
              <p className="text-xs text-slate-500">Shared Household Egg & Expense Manager</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setAuthTab('switch')}
              className={`py-2 rounded-lg transition ${authTab === 'switch' ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-slate-600'}`}
            >
              Saved Rooms
            </button>
            <button
              type="button"
              onClick={() => setAuthTab('join')}
              className={`py-2 rounded-lg transition ${authTab === 'join' ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-slate-600'}`}
            >
              Join Room
            </button>
            <button
              type="button"
              onClick={() => setAuthTab('create')}
              className={`py-2 rounded-lg transition ${authTab === 'create' ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-slate-600'}`}
            >
              Create Room
            </button>
          </div>

          {authTab === 'switch' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Select your household room and profile to sign in:</p>
              {db.households.length === 0 && (
                <div className="p-5 rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
                  <p className="text-xs text-slate-600 font-medium">
                    No rooms saved yet — your app is completely fresh!
                  </p>
                  <button
                    type="button"
                    onClick={() => setAuthTab('create')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                  >
                    + Create Your First Household Room
                  </button>
                </div>
              )}
              {db.households.map((h) => {
                const rMembers = db.household_members.filter((m) => m.household_id === h.id && m.status === 'active');
                return (
                  <div key={h.id} className="border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{h.name}</div>
                        <div className="text-xs text-slate-500">
                          Room Code: <span className="font-mono font-semibold text-emerald-700">{h.room_code}</span> · PIN: {h.pin_code}
                        </div>
                      </div>
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                        {rMembers.length} members
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {rMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSession({ householdId: h.id, memberId: m.id });
                            showToast(`Signed in as ${m.name} (${m.role})`);
                          }}
                          className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-left transition"
                        >
                          <span className="text-xl">{m.avatar}</span>
                          <div className="overflow-hidden">
                            <div className="text-xs font-semibold text-slate-900 truncate">{m.name}</div>
                            <div className="text-[10px] text-slate-500 capitalize">{m.role}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {authTab === 'join' && (
            <form onSubmit={handleJoinRoom} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Room Code</label>
                <input
                  type="text"
                  required
                  value={joinRoomCode}
                  onChange={(e) => setJoinRoomCode(e.target.value)}
                  placeholder="e.g. EGG-302"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm uppercase font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Household PIN</label>
                <input
                  type="password"
                  required
                  value={joinRoomPin}
                  onChange={(e) => setJoinRoomPin(e.target.value)}
                  placeholder="4-digit PIN (e.g. 1234)"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Your Name</label>
                <input
                  type="text"
                  required
                  value={joinMemberName}
                  onChange={(e) => setJoinMemberName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Choose Avatar</label>
                <div className="flex flex-wrap gap-1.5">
                  {AVATAR_OPTIONS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setJoinAvatar(av)}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border ${
                        joinAvatar === av ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition"
              >
                Join Household Room
              </button>
            </form>
          )}

          {authTab === 'create' && (
            <form onSubmit={handleCreateRoom} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Room Name</label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Green Valley Flat 4B"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Your Name (Admin)</label>
                  <input
                    type="text"
                    required
                    value={newRoomAdminName}
                    onChange={(e) => setNewRoomAdminName(e.target.value)}
                    placeholder="e.g. Mahesh"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Access PIN</label>
                  <input
                    type="text"
                    required
                    value={newRoomPin}
                    onChange={(e) => setNewRoomPin(e.target.value)}
                    placeholder="1234"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Roommates Count</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newRoomCount}
                    onChange={(e) => setNewRoomCount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Daily Eggs / Person</label>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={newRoomDefaultEggs}
                    onChange={(e) => setNewRoomDefaultEggs(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition"
              >
                Create Room as Admin
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Total household unpaid amount across all active purchases
  const totalHouseholdUnpaidPaise = memberSummaries.reduce((s, m) => s + m.remainingDuePaise, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans pb-24 md:pb-0">
      {/* ====================================================================
          DESKTOP SIDEBAR NAVIGATION
         ==================================================================== */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-slate-200 shrink-0 justify-between p-4">
        <div className="space-y-6">
          {/* App Brand */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                <Egg className="w-6 h-6" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-slate-900">EggMate</span>
                <span className="block text-[11px] text-emerald-700 font-medium">{currentHousehold.name}</span>
              </div>
            </div>
          </div>

          {/* Primary Quick CTA */}
          <button
            type="button"
            onClick={() => {
              setAddMode('consume');
              setActiveTab('add_eggs');
            }}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Add Eggs Used</span>
          </button>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {[
              { id: 'home', label: 'Home', icon: Home },
              { id: 'my_eggs', label: 'My Eggs', icon: Egg },
              { id: 'add_eggs', label: 'Add Eggs', icon: PlusCircle },
              { id: 'payments', label: 'Payments', icon: Wallet, badge: pendingConfirmationsForMe.length },
              { id: 'members', label: 'Members', icon: Users },
              { id: 'reports', label: 'Reports', icon: BarChart3 },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as typeof activeTab)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span className="px-2 py-0.5 text-[11px] rounded-full bg-amber-100 text-amber-800 font-bold">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Active Profile & Room Code */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Room Code</span>
              <span className="font-mono font-bold text-emerald-700">{currentHousehold.room_code}</span>
            </div>
            <div className="flex items-center gap-2.5 mt-2">
              <span className="text-2xl">{currentMember.avatar}</span>
              <div className="overflow-hidden flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{currentMember.name}</div>
                <div className="text-[11px] text-emerald-700 font-medium capitalize">{currentMember.role}</div>
              </div>
              <button
                type="button"
                onClick={() => setRoomSwitcherOpen(true)}
                title="Switch Member or Room"
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ====================================================================
          MAIN CONTENT AREA
         ==================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP DASHBOARD HEADER */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Room Name, Date & Welcome */}
            <div className="flex items-center gap-3">
              <div className="md:hidden w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                <Egg className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base md:text-lg font-bold text-slate-900">{currentHousehold.name}</h1>
                  <span className="text-[11px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                    {currentHousehold.room_code}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Welcome, <span className="font-semibold text-slate-700">{currentMember.name}</span> · Today:{' '}
                  <span className="font-medium text-slate-700">{formatDateIN(todayISO)}</span>
                </p>
              </div>
            </div>

            {/* Right Controls: Quick Member Switcher (for testing multi-member views), Notifications, Room Modal */}
            <div className="flex items-center gap-2">
              {/* Instant Profile Switcher Pill Bar */}
              <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 px-2 font-medium">View as:</span>
                {activeMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSession({ householdId: currentHousehold.id, memberId: m.id });
                      showToast(`Switched active profile to ${m.name} (${m.role})`, 'info');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
                      m.id === currentMember.id
                        ? 'bg-white text-emerald-700 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{m.avatar}</span>
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>

              {/* Mobile Profile Switch Button */}
              <button
                type="button"
                onClick={() => setRoomSwitcherOpen(true)}
                className="sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800"
              >
                <span>{currentMember.avatar}</span>
                <span>{currentMember.name}</span>
              </button>

              {/* Notification Bell */}
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  if (!notifOpen && currentMember) {
                    setDb((prev) => ({
                      ...prev,
                      notifications: prev.notifications.map((n) =>
                        n.household_id === currentHousehold.id && !n.is_read_by.includes(currentMember.id)
                          ? { ...n, is_read_by: [...n.is_read_by, currentMember.id] }
                          : n
                      )
                    }));
                  }
                }}
                className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Mobile Quick Profile Bar */}
          <div className="sm:hidden flex items-center gap-1.5 overflow-x-auto pt-2 mt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 shrink-0">Member:</span>
            {activeMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSession({ householdId: currentHousehold.id, memberId: m.id });
                  showToast(`Viewing as ${m.name}`);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs shrink-0 flex items-center gap-1 ${
                  m.id === currentMember.id
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <span>{m.avatar}</span>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </header>

        {/* TOAST BANNER */}
        {toast && (
          <div className="fixed top-16 right-4 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-lg border border-slate-700 flex items-center gap-3">
            {toast.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : toast.type === 'info' ? (
              <Info className="w-5 h-5 text-sky-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <span className="text-xs font-medium flex-1">{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* NOTIFICATIONS DROPDOWN DRAWER */}
        {notifOpen && (
          <div className="bg-white border-b border-slate-200 shadow-sm px-4 py-4">
            <div className="max-w-5xl mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-slate-900">Household Notifications & Alerts</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Close
                </button>
              </div>
              {visibleNotifications.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No active notifications.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {visibleNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                        n.type === 'shortage_warning'
                          ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold">{n.title}</div>
                        <div className="text-slate-600">{n.message}</div>
                        <div className="text-[10px] text-slate-400">{formatDateTimeIN(n.created_at)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDb((prev) => ({
                            ...prev,
                            notifications: prev.notifications.map((x) =>
                              x.id === n.id ? { ...x, is_active: false } : x
                            )
                          }))
                        }
                        className="text-slate-400 hover:text-slate-700 p-1"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PAGE BODY */}
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 space-y-6">
          {/* ================================================================
              GLOBAL ACTION BANNERS (Allocation Acceptance & Payment Confirmation)
             ================================================================ */}
          {myPendingAllocations.map((alloc) => {
            const pur = householdPurchases.find((p) => p.id === alloc.purchase_id);
            if (!pur) return null;
            const buyerName = memberMap.get(pur.purchased_by)?.name || 'Roommate';
            return (
              <div
                key={alloc.id}
                className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wide">
                    <PackageCheck className="w-4 h-4" />
                    <span>Action Required: Approve Your Egg Share</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {buyerName} purchased {pur.total_eggs} eggs for {formatINR(pur.total_price_paise)} ({formatDateIN(pur.purchase_date)}).
                  </p>
                  <p className="text-xs text-slate-700">
                    Your share: <span className="font-bold text-emerald-800">{alloc.allocated_eggs} eggs</span> ·{' '}
                    <span className="font-bold text-emerald-800">{formatINR(alloc.allocated_amount_paise)}</span> to pay{' '}
                    {buyerName}.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAcceptAllocation(alloc.id)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Accept</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('payments')}
                    className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}

          {pendingConfirmationsForMe.map((pay) => {
            const payerName = memberMap.get(pay.from_member_id)?.name || 'Member';
            return (
              <div
                key={pay.id}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wide">
                    <Clock className="w-4 h-4" />
                    <span>Payment Confirmation Needed</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {payerName} says they paid you {formatINR(pay.amount_paise)}.
                  </p>
                  <p className="text-xs text-slate-600">
                    Date: {formatDateIN(pay.payment_date)} · Method: {pay.payment_method}{' '}
                    {pay.note ? `· Note: "${pay.note}"` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleConfirmOrRejectPayment(pay, 'confirmed')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm Received</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmOrRejectPayment(pay, 'rejected')}
                    className="px-3 py-2 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject Payment</span>
                  </button>
                </div>
              </div>
            );
          })}

          {/* ================================================================
              TAB 1: HOME DASHBOARD
             ================================================================ */}
          {activeTab === 'home' && (
            <div className="space-y-6">
              {/* Prominent 1-Tap Quick Action Banner */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-slate-900">Quick Household Actions</h2>
                  <p className="text-xs text-slate-500">
                    Record your daily egg consumption in seconds or add a new tray purchase.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('consume');
                      setActiveTab('add_eggs');
                    }}
                    className="flex-1 sm:flex-initial px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ Add Eggs Used</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('purchase');
                      setActiveTab('add_eggs');
                    }}
                    className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-sm border border-emerald-200 flex items-center justify-center gap-2 transition"
                  >
                    <Egg className="w-4 h-4" />
                    <span>+ Add Purchase</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm border border-slate-200 flex items-center justify-center gap-2 transition"
                  >
                    <UserPlus className="w-4 h-4 text-emerald-700" />
                    <span>+ Add Roommate ({activeMembers.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(true)}
                    className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-sm border border-rose-200 flex items-center justify-center gap-2 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Start Fresh / Clear Demo</span>
                  </button>
                </div>
              </div>

              {/* 4 MAIN STATISTICS CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Eggs Left */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Eggs Left</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Egg className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    {inventoryStats.availableEggs}
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Available now</span>
                    {inventoryStats.availableEggs <= currentSettings.low_stock_threshold ? (
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
                        Low Stock
                      </span>
                    ) : (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                        In Stock
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Eggs Bought */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Eggs Bought</span>
                    <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                      <PackageCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    {inventoryStats.totalBought}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Total spend:{' '}
                    <span className="font-semibold text-slate-800">{formatINR(inventoryStats.totalSpentPaise)}</span>
                  </div>
                </div>

                {/* 3. Eggs Used */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Eggs Used</span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Flame className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    {inventoryStats.totalUsed}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Wasted: <span className="font-semibold text-slate-700">{inventoryStats.totalWasted}</span> ·{' '}
                    {inventoryStats.pctRemaining}% left
                  </div>
                </div>

                {/* 4. Next Buy Day */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Next Buy Day</span>
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Calendar className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-lg sm:text-xl font-extrabold text-slate-900 truncate">
                    {prediction.exhaustionDayName
                      ? `${prediction.exhaustionDayName}`
                      : inventoryStats.availableEggs === 0
                      ? 'Today'
                      : 'Sufficient'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {prediction.exhaustionDate
                      ? `Runs out ${formatDateIN(prediction.exhaustionDate)}`
                      : 'Based on weekly schedule'}
                  </div>
                </div>
              </div>

              {/* SMART PURCHASE REMINDER & INVENTORY PROGRESS SECTION */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Egg Inventory & Smart Exhaustion Schedule (7 cols) */}
                <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Egg Inventory & Smart Forecast</h3>
                      <p className="text-xs text-slate-500">
                        Mode:{' '}
                        {currentSettings.prediction_mode === 'schedule'
                          ? 'Configured Weekly Schedule (8 eggs/weekday, 0 weekend)'
                          : 'Recent Actual Consumption Average'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {inventoryStats.availableEggs} / {inventoryStats.totalBought} Eggs
                    </span>
                  </div>

                  {/* Inventory Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          inventoryStats.availableEggs <= currentSettings.low_stock_threshold
                            ? 'bg-amber-500'
                            : 'bg-emerald-600'
                        }`}
                        style={{ width: `${inventoryStats.pctRemaining}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Consumed: {inventoryStats.totalUsed} eggs</span>
                      <span>Wasted: {inventoryStats.totalWasted} eggs</span>
                      <span>Available: {inventoryStats.availableEggs} eggs</span>
                    </div>
                  </div>

                  {/* Day-by-Day Expected Inventory Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">
                        Weekly Inventory Projection
                      </span>
                      {prediction.exhaustionDate && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                          Exhaustion: {prediction.exhaustionDayName} ({formatDateIN(prediction.exhaustionDate)})
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-500">
                            <th className="py-2 px-3 font-medium">Day</th>
                            <th className="py-2 px-3 font-medium">Date</th>
                            <th className="py-2 px-3 font-medium text-right">Eggs Consumed</th>
                            <th className="py-2 px-3 font-medium text-right">Remaining</th>
                            <th className="py-2 px-3 font-medium text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {prediction.forecastRows.map((row) => (
                            <tr
                              key={row.date}
                              className={
                                row.statusLabel === 'Runs Out!'
                                  ? 'bg-amber-50/70 font-semibold'
                                  : ''
                              }
                            >
                              <td className="py-2 px-3 font-medium text-slate-900">{row.dayName}</td>
                              <td className="py-2 px-3 text-slate-500">{formatDateIN(row.date)}</td>
                              <td className="py-2 px-3 text-right text-slate-700">{row.eggsConsumedOrPlanned}</td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">{row.remainingAfter}</td>
                              <td className="py-2 px-3 text-right">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    row.statusLabel === 'Runs Out!'
                                      ? 'bg-rose-100 text-rose-700'
                                      : row.statusLabel === 'Recorded'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : row.statusLabel === 'No Planned Use'
                                      ? 'bg-slate-100 text-slate-600'
                                      : 'bg-sky-50 text-sky-700'
                                  }`}
                                >
                                  {row.statusLabel}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Dynamic Smart Reminder Schedule Box */}
                  {prediction.reminderSchedule.length > 0 && (
                    <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>Smart Purchase Reminder Schedule</span>
                        </div>
                        <span className="text-[10px] text-amber-700 font-medium">
                          Auto-stops when sufficient eggs are added
                        </span>
                      </div>
                      <ul className="space-y-1 text-xs text-amber-900">
                        {prediction.reminderSchedule.map((r) => (
                          <li key={r.date} className="flex items-start gap-2">
                            <span className="font-semibold shrink-0 w-20">{r.dayName}:</span>
                            <span className="text-amber-800">{r.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Member Consumption Breakdown Card (5 cols) */}
                <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Member Consumption</h3>
                      <p className="text-xs text-slate-500">Who consumed how many eggs</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('members')}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Schedules →
                    </button>
                  </div>

                  <div className="space-y-3">
                    {memberSummaries.map((item) => {
                      const pctOfUsed =
                        inventoryStats.totalUsed > 0
                          ? Math.round((item.eggsUsed / inventoryStats.totalUsed) * 100)
                          : 0;
                      return (
                        <div
                          key={item.member.id}
                          className="p-3 rounded-2xl border border-slate-100 bg-slate-50/60 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl">{item.member.avatar}</span>
                              <div>
                                <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                                  <span>{item.member.name}</span>
                                  {item.member.status === 'left' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                      Left
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Target: {item.member.default_daily_eggs} eggs/weekday · Avg: {item.scheduledDailyAvg}/day
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-base font-extrabold text-slate-900">
                                {item.eggsUsed} <span className="text-xs font-normal text-slate-500">eggs</span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Share: {item.allocatedEggs} eggs
                              </div>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${pctOfUsed}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* PAYMENT OVERVIEW & RECENT ACTIVITY */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Payment Overview (6 cols) */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Payment Overview</h3>
                      <p className="text-xs text-slate-500">Who needs to pay & who is waiting to receive</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('payments')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                    >
                      Open Payments
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-100">
                      <span className="text-xs text-rose-700 font-medium">Total Unpaid Balance</span>
                      <div className="text-xl font-extrabold text-rose-900 mt-0.5">
                        {formatINR(totalHouseholdUnpaidPaise)}
                      </div>
                      <span className="text-[11px] text-rose-600">Across active room members</span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100">
                      <span className="text-xs text-emerald-700 font-medium">Total Household Spend</span>
                      <div className="text-xl font-extrabold text-emerald-900 mt-0.5">
                        {formatINR(inventoryStats.totalSpentPaise)}
                      </div>
                      <span className="text-[11px] text-emerald-700">{householdPurchases.length} purchase(s)</span>
                    </div>
                  </div>

                  {/* Who is waiting to receive & who needs to pay */}
                  <div className="space-y-2">
                    {memberSummaries.map((s) => (
                      <div
                        key={s.member.id}
                        className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/60 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{s.member.avatar}</span>
                          <div>
                            <div className="font-semibold text-slate-900">{s.member.name}</div>
                            <div className="text-[11px] text-slate-500">
                              Share: {formatINR(s.purchaseSharePaise)} · Paid: {formatINR(s.confirmedPaidPaise)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {s.waitingToReceiveFromOthersPaise > 0 && (
                            <div className="font-bold text-emerald-700">
                              To receive: {formatINR(s.waitingToReceiveFromOthersPaise)}
                            </div>
                          )}
                          {s.remainingDuePaise > 0 ? (
                            <div className="font-bold text-rose-600">
                              Needs to pay: {formatINR(s.remainingDuePaise)}
                            </div>
                          ) : s.waitingToReceiveFromOthersPaise === 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                              Settled
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Activity (6 cols) */}
                <div className="lg:col-span-6 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
                      <p className="text-xs text-slate-500">Live household audit trail</p>
                    </div>
                    <History className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {householdActivities.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">No recent activity yet.</p>
                    ) : (
                      householdActivities.slice(0, 12).map((act) => (
                        <div
                          key={act.id}
                          className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition text-xs"
                        >
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              act.category === 'purchase'
                                ? 'bg-sky-50 text-sky-600'
                                : act.category === 'payment'
                                ? 'bg-emerald-50 text-emerald-600'
                                : act.category === 'consumption'
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {act.category === 'purchase' ? (
                              <PackageCheck className="w-3.5 h-3.5" />
                            ) : act.category === 'payment' ? (
                              <IndianRupee className="w-3.5 h-3.5" />
                            ) : (
                              <Egg className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-800 font-medium leading-snug">{act.message}</p>
                            <span className="text-[10px] text-slate-400">{formatDateTimeIN(act.created_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 2: MY EGGS (PERSONAL DASHBOARD, MONTHLY SPENDING & LOGS)
             ================================================================ */}
          {activeTab === 'my_eggs' && currentMemberSummary && (
            <div className="space-y-6">
              {/* Personal Header Banner */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-3xl">
                    {currentMember.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{currentMember.name}&apos;s Egg Dashboard</h2>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold capitalize">
                        {currentMember.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Separate tracking for purchase shares, confirmed payments, and FIFO consumption value (never double-counted).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddMode('consume');
                    setActiveTab('add_eggs');
                  }}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Record My Eggs</span>
                </button>
              </div>

              {/* 5 Distinct Personal Figures (Section 11 Requirement) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[11px] font-medium text-slate-500">1. My Egg Share</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">
                    {formatINR(currentMemberSummary.purchaseSharePaise)}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {currentMemberSummary.allocatedEggs} eggs allocated
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[11px] font-medium text-slate-500">2. Amount Paid</span>
                  <div className="text-xl font-extrabold text-emerald-700 mt-1">
                    {formatINR(currentMemberSummary.confirmedPaidPaise)}
                  </div>
                  <span className="text-[11px] text-slate-500">Confirmed settled share</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[11px] font-medium text-slate-500">3. Amount Due</span>
                  <div className="text-xl font-extrabold text-rose-600 mt-1">
                    {formatINR(currentMemberSummary.remainingDuePaise)}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {currentMemberSummary.pendingConfirmationPaise > 0
                      ? `${formatINR(currentMemberSummary.pendingConfirmationPaise)} awaiting confirm`
                      : 'Remaining unpaid'}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[11px] font-medium text-slate-500">4. Eggs Consumed</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">
                    {currentMemberSummary.eggsUsed} <span className="text-xs font-normal">eggs</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    This month: {currentMemberSummary.eggsUsedThisMonth} eggs
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-medium text-slate-500">5. Consumption Value</span>
                  <div className="text-xl font-extrabold text-sky-700 mt-1">
                    {formatINR(currentMemberSummary.fifoConsumptionValuePaise)}
                  </div>
                  <span className="text-[11px] text-slate-500">FIFO informational metric</span>
                </div>
              </div>

              {/* If Member is a Purchaser: Upfront Spend & Receivables Card */}
              {currentMemberSummary.upfrontPurchaseTotalPaise > 0 && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-emerald-950">
                      Your Purchaser Summary (Money You Spent Upfront for the Room)
                    </h3>
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      You never owe money to yourself
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-2xl border border-emerald-100">
                      <span className="text-slate-500">Original Purchase(s)</span>
                      <div className="text-base font-extrabold text-slate-900 mt-0.5">
                        {formatINR(currentMemberSummary.upfrontPurchaseTotalPaise)}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-emerald-100">
                      <span className="text-slate-500">Your Own Share</span>
                      <div className="text-base font-extrabold text-slate-900 mt-0.5">
                        {formatINR(currentMemberSummary.purchaseSharePaise)}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-emerald-100">
                      <span className="text-slate-500">Expected from Roommates</span>
                      <div className="text-base font-extrabold text-emerald-700 mt-0.5">
                        {formatINR(currentMemberSummary.expectedFromOthersPaise)}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-emerald-100">
                      <span className="text-slate-500">Received / Still Waiting</span>
                      <div className="text-base font-extrabold text-amber-700 mt-0.5">
                        {formatINR(currentMemberSummary.receivedFromOthersPaise)} /{' '}
                        {formatINR(currentMemberSummary.waitingToReceiveFromOthersPaise)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Consumption History Table with Edit & Delete */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Consumption & Waste History {isAdmin ? '(All Room Members)' : ''}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Edit or delete any incorrect entry — inventory and exhaustion forecasts update automatically.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3 font-medium">Member</th>
                        <th className="py-2.5 px-3 font-medium">Date</th>
                        <th className="py-2.5 px-3 font-medium">Quantity</th>
                        <th className="py-2.5 px-3 font-medium">FIFO Value</th>
                        <th className="py-2.5 px-3 font-medium">Description</th>
                        <th className="py-2.5 px-3 font-medium">Recorded At</th>
                        <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {householdConsumption.map((log) => {
                        const mem = memberMap.get(log.member_id);
                        const canEdit = isAdmin || log.member_id === currentMember.id;
                        return (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              <span className="mr-1.5">{mem?.avatar}</span>
                              {mem?.name || 'Member'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{formatDateIN(log.consumption_date)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {log.eggs_count} {log.log_type === 'waste' ? '(Waste)' : 'eggs'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{formatINR(log.fifo_cost_paise)}</td>
                            <td className="py-2.5 px-3 text-slate-600">{log.description}</td>
                            <td className="py-2.5 px-3 text-slate-400">{formatDateTimeIN(log.created_at)}</td>
                            <td className="py-2.5 px-3 text-right">
                              {canEdit && (
                                <div className="inline-flex items-center gap-1">
                                  {log.log_type === 'consumption' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingConsumption(log);
                                        setConsumeMemberId(log.member_id);
                                        setConsumeQty(log.eggs_count);
                                        setConsumeDate(log.consumption_date);
                                        setConsumeDesc(log.description);
                                        setAddMode('consume');
                                        setActiveTab('add_eggs');
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600"
                                      title="Edit Entry"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteConsumption(log)}
                                    className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600"
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 3: ADD EGGS (CONSUMPTION, PURCHASE & WASTE)
             ================================================================ */}
          {activeTab === 'add_eggs' && (
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Mode Selector */}
              <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 p-1.5 rounded-2xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAddMode('consume')}
                  className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                    addMode === 'consume' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <Flame className="w-4 h-4" />
                  <span>+ Add Eggs Used</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('purchase')}
                  className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                    addMode === 'purchase' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>+ New Purchase</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('waste')}
                  className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                    addMode === 'waste' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Record Waste</span>
                </button>
              </div>

              {/* SUB-FORM A: RECORD EGG CONSUMPTION */}
              {addMode === 'consume' && (
                <form
                  onSubmit={handleRecordConsumption}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {editingConsumption ? 'Edit Egg Consumption Entry' : 'Record Egg Consumption'}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Available household inventory:{' '}
                        <span className="font-bold text-emerald-700">{inventoryStats.availableEggs} eggs</span>
                      </p>
                    </div>
                    {editingConsumption && (
                      <button
                        type="button"
                        onClick={() => setEditingConsumption(null)}
                        className="text-xs text-rose-600 font-semibold"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  {/* Member Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Member</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {activeMembers.map((m) => {
                        const selected = consumeMemberId === m.id;
                        const disabled = !isAdmin && m.id !== currentMember.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setConsumeMemberId(m.id)}
                            className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition ${
                              selected
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                                : disabled
                                ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                                : 'border-slate-200 hover:border-emerald-300'
                            }`}
                          >
                            <span className="text-lg">{m.avatar}</span>
                            <span className="text-xs truncate">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Quantity Buttons (1, 2, 3, 4, Custom) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Number of Eggs</label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setConsumeQty(n);
                            setConsumeCustomMode(false);
                          }}
                          className={`py-3 rounded-2xl border text-sm font-bold transition ${
                            !consumeCustomMode && consumeQty === n
                              ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                              : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-emerald-400'
                          }`}
                        >
                          {n} {n === 1 ? 'Egg' : 'Eggs'}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setConsumeCustomMode(true)}
                        className={`py-3 rounded-2xl border text-xs font-bold transition ${
                          consumeCustomMode
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-emerald-400'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                    {consumeCustomMode && (
                      <div className="mt-3 flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, inventoryStats.availableEggs + (editingConsumption?.eggs_count || 0))}
                          value={consumeQty}
                          onChange={(e) => setConsumeQty(Number(e.target.value))}
                          className="w-32 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                        />
                        <span className="text-xs text-slate-500">
                          Max available: {inventoryStats.availableEggs + (editingConsumption?.eggs_count || 0)} eggs
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Date & Optional Description */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date ({formatDateIN(consumeDate)})
                      </label>
                      <input
                        type="date"
                        required
                        value={consumeDate}
                        onChange={(e) => setConsumeDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                      <span className="text-[10px] text-slate-400">
                        Forgot earlier? Pick today or any past date.
                      </span>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Short Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={consumeDesc}
                        onChange={(e) => setConsumeDesc(e.target.value)}
                        placeholder="e.g. Breakfast boiled eggs"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['Morning boiled eggs', 'Breakfast omelette', 'Post-workout', 'Dinner bhurji'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setConsumeDesc(preset)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-emerald-50 text-slate-600"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={inventoryStats.availableEggs === 0 && !editingConsumption}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-sm transition"
                  >
                    {editingConsumption
                      ? `Update Entry (${consumeQty} Eggs)`
                      : inventoryStats.availableEggs === 0
                      ? 'Out of Stock — Add a Purchase First'
                      : `Save Consumption (${consumeQty} ${consumeQty === 1 ? 'Egg' : 'Eggs'})`}
                  </button>
                </form>
              )}

              {/* SUB-FORM B: ADD OR EDIT EGG PURCHASE WITH AUTOMATIC / CUSTOM SPLITTING */}
              {addMode === 'purchase' && (
                <form
                  onSubmit={handleSavePurchase}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {editingPurchase ? 'Edit Egg Purchase & Allocation' : 'Add New Egg Purchase'}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Automatically splits eggs & cost among active roommates and creates payment dues.
                      </p>
                    </div>
                    {editingPurchase && (
                      <button
                        type="button"
                        onClick={() => setEditingPurchase(null)}
                        className="text-xs text-rose-600 font-semibold"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Eggs Purchased</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={purchaseEggs}
                        onChange={(e) => setPurchaseEggs(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                      <div className="flex gap-1 mt-1">
                        {[12, 30, 40, 60].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setPurchaseEggs(q)}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 text-slate-700 font-medium"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Total Price (₹)</label>
                      <input
                        type="number"
                        min={1}
                        step="0.01"
                        required
                        value={purchasePriceINR}
                        onChange={(e) => setPurchasePriceINR(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                      <span className="text-[11px] text-emerald-700 font-semibold block mt-1">
                        Cost/egg:{' '}
                        {purchaseEggs > 0
                          ? formatINR(Math.round(((parseFloat(purchasePriceINR) || 0) * 100) / purchaseEggs))
                          : '₹0'}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Purchase Date ({formatDateIN(purchaseDate)})
                      </label>
                      <input
                        type="date"
                        required
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Purchased By</label>
                      <select
                        value={purchasedById}
                        onChange={(e) => setPurchasedById(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white font-medium"
                      >
                        {activeMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.avatar} {m.name} ({m.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Optional Notes</label>
                      <input
                        type="text"
                        value={purchaseNotes}
                        onChange={(e) => setPurchaseNotes(e.target.value)}
                        placeholder="e.g. Wholesale tray from market"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  {/* Automatic Egg & Money Splitting Table */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                          Automatic Egg & Money Split ({activeMembers.length} Active Roommates)
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          All quantities and ₹ shares must add up exactly to {purchaseEggs} eggs and{' '}
                          {formatINR(Math.round((parseFloat(purchasePriceINR) || 0) * 100))}.
                        </p>
                      </div>
                      <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setSplitMode('equal');
                            const pricePaise = Math.round((parseFloat(purchasePriceINR) || 0) * 100);
                            setCustomAllocations(
                              computeEqualSplit(
                                purchaseEggs,
                                pricePaise,
                                activeMembers.map((m) => m.id)
                              )
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg font-semibold ${
                            splitMode === 'equal' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          Equal Split
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitMode('custom')}
                          className={`px-2.5 py-1 rounded-lg font-semibold ${
                            splitMode === 'custom' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          Custom Split
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {customAllocations.map((alloc, idx) => {
                        const mem = memberMap.get(alloc.memberId);
                        if (!mem) return null;
                        return (
                          <div
                            key={alloc.memberId}
                            className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base">{mem.avatar}</span>
                              <div>
                                <div className="font-semibold text-slate-900">{mem.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  {mem.id === purchasedById ? 'Purchaser (Own share auto-paid)' : 'Needs to accept & pay'}
                                </div>
                              </div>
                            </div>

                            {splitMode === 'equal' ? (
                              <div className="text-right">
                                <span className="font-bold text-slate-900">{alloc.eggs} eggs</span> ·{' '}
                                <span className="font-extrabold text-emerald-700">
                                  {formatINR(alloc.amountPaise)}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={alloc.eggs}
                                    onChange={(e) => {
                                      const nextEggs = Math.max(0, Number(e.target.value));
                                      const nextList = customAllocations.map((item, i) =>
                                        i === idx ? { ...item, eggs: nextEggs } : item
                                      );
                                      const totalPaise = Math.round((parseFloat(purchasePriceINR) || 0) * 100);
                                      setCustomAllocations(
                                        computeMoneyFromCustomEggs(purchaseEggs, totalPaise, nextList)
                                      );
                                    }}
                                    className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-right font-bold"
                                  />
                                  <span className="text-slate-500">eggs</span>
                                </div>
                                <span className="font-bold text-emerald-700 w-20 text-right">
                                  {formatINR(alloc.amountPaise)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition"
                  >
                    {editingPurchase
                      ? 'Save Updated Purchase & Prompt Re-Approval'
                      : `Save Purchase (${purchaseEggs} Eggs for ₹${purchasePriceINR})`}
                  </button>
                </form>
              )}

              {/* SUB-FORM C: RECORD WASTE */}
              {addMode === 'waste' && (
                <form
                  onSubmit={handleRecordWaste}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4"
                >
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Record Broken or Spoiled Eggs</h2>
                    <p className="text-xs text-slate-500">
                      Deducts damaged eggs from available inventory ({inventoryStats.availableEggs} left) and tracks waste expense in Reports.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Wasted Eggs Count</label>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, inventoryStats.availableEggs)}
                        value={wasteEggs}
                        onChange={(e) => setWasteEggs(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date ({formatDateIN(wasteDate)})
                      </label>
                      <input
                        type="date"
                        value={wasteDate}
                        onChange={(e) => setWasteDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Note</label>
                    <input
                      type="text"
                      value={wasteReason}
                      onChange={(e) => setWasteReason(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={inventoryStats.availableEggs === 0}
                    className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-sm transition"
                  >
                    Record Waste
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 4: PAYMENTS (SETTLEMENTS, CONFIRMATIONS & MULTI-PURCHASE FIFO)
             ================================================================ */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              {/* Top Bar: Record Payment CTA */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Payments & Purchase Shares</h2>
                  <p className="text-xs text-slate-500">
                    The person who purchases the eggs receives the money from other members and confirms receipt.
                  </p>
                </div>
                {currentMemberSummary && currentMemberSummary.remainingDuePaise > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Default to paying the purchaser of the oldest unpaid allocation
                      const firstUnpaid = householdAllocations.find(
                        (a) =>
                          a.member_id === currentMember.id &&
                          a.allocated_amount_paise - a.paid_amount_paise - a.pending_confirmation_paise > 0
                      );
                      const pur = firstUnpaid
                        ? householdPurchases.find((p) => p.id === firstUnpaid.purchase_id)
                        : householdPurchases[0];
                      setPayToMemberId(pur?.purchased_by || activeMembers[0]?.id || '');
                      setPayTargetAllocationId('FIFO_ALL');
                      setPayAmountINR(
                        String(
                          (currentMemberSummary.remainingDuePaise - currentMemberSummary.pendingConfirmationPaise) / 100
                        )
                      );
                      setPaymentModalOpen(true);
                    }}
                    className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-2 shrink-0"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Record Payment ({formatINR(currentMemberSummary.remainingDuePaise)} Due)</span>
                  </button>
                )}
              </div>

              {/* Member-by-Member Financial Matrix (Exact Section 10 & 18 Layout) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {memberSummaries.map((s) => {
                  const isMe = s.member.id === currentMember.id;
                  return (
                    <div
                      key={s.member.id}
                      className={`bg-white rounded-2xl p-4 border shadow-sm space-y-2.5 ${
                        isMe ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{s.member.avatar}</span>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              {s.member.name} {isMe && '(You)'}
                            </div>
                            <div className="text-[10px] text-slate-500 capitalize">{s.member.role}</div>
                          </div>
                        </div>
                      </div>

                      {s.upfrontPurchaseTotalPaise > 0 && (
                        <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-100 text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Paid upfront:</span>
                            <span className="font-bold text-slate-900">{formatINR(s.upfrontPurchaseTotalPaise)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Own share:</span>
                            <span className="font-semibold text-slate-800">{formatINR(s.purchaseSharePaise)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Expected to receive:</span>
                            <span className="font-semibold text-emerald-800">{formatINR(s.expectedFromOthersPaise)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Confirmed received:</span>
                            <span className="font-bold text-emerald-700">{formatINR(s.receivedFromOthersPaise)}</span>
                          </div>
                          <div className="flex justify-between border-t border-emerald-200/70 pt-1">
                            <span className="text-emerald-900 font-semibold">Still waiting:</span>
                            <span className="font-extrabold text-amber-700">
                              {formatINR(s.waitingToReceiveFromOthersPaise)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="text-xs space-y-1 pt-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Purchase share:</span>
                          <span className="font-semibold text-slate-900">{formatINR(s.purchaseSharePaise)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Paid:</span>
                          <span className="font-semibold text-emerald-700">{formatINR(s.confirmedPaidPaise)}</span>
                        </div>
                        {s.pendingConfirmationPaise > 0 && (
                          <div className="flex justify-between">
                            <span className="text-amber-700">Waiting confirmation:</span>
                            <span className="font-semibold text-amber-700">
                              {formatINR(s.pendingConfirmationPaise)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-slate-100 pt-1">
                          <span className="font-semibold text-slate-700">Remaining due:</span>
                          <span
                            className={`font-extrabold ${
                              s.remainingDuePaise > 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {formatINR(s.remainingDuePaise)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* RECORD PAYMENT MODAL / INLINE DRAWER */}
              {paymentModalOpen && (
                <form
                  onSubmit={handleRecordPayment}
                  className="bg-emerald-50/90 border-2 border-emerald-500 rounded-3xl p-5 space-y-4 shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Record Payment from {currentMember.name}
                      </h3>
                      <p className="text-xs text-slate-600">
                        Your payment will be marked &quot;Waiting for Confirmation&quot; until the purchaser confirms receipt.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentModalOpen(false)}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pay To (Purchaser)</label>
                      <select
                        value={payToMemberId}
                        onChange={(e) => setPayToMemberId(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium"
                      >
                        {householdMembers
                          .filter((m) => m.id !== currentMember.id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.avatar} {m.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Apply To Purchase
                      </label>
                      <select
                        value={payTargetAllocationId}
                        onChange={(e) => setPayTargetAllocationId(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium"
                      >
                        <option value="FIFO_ALL">Auto-apply FIFO across all unpaid purchases</option>
                        {householdAllocations
                          .filter((a) => {
                            const pur = householdPurchases.find((p) => p.id === a.purchase_id);
                            return (
                              a.member_id === currentMember.id &&
                              pur?.purchased_by === payToMemberId &&
                              a.allocated_amount_paise - a.paid_amount_paise - a.pending_confirmation_paise > 0
                            );
                          })
                          .map((a) => {
                            const pur = householdPurchases.find((p) => p.id === a.purchase_id)!;
                            const rem =
                              a.allocated_amount_paise - a.paid_amount_paise - a.pending_confirmation_paise;
                            return (
                              <option key={a.id} value={a.id}>
                                {formatDateIN(pur.purchase_date)} ({pur.total_eggs} eggs) — Due: {formatINR(rem)}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Paid (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={1}
                        required
                        value={payAmountINR}
                        onChange={(e) => setPayAmountINR(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Payment Date ({formatDateIN(payDate)})
                      </label>
                      <input
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
                      >
                        <option value="UPI (GPay)">UPI (GPay)</option>
                        <option value="UPI (PhonePe)">UPI (PhonePe)</option>
                        <option value="Cash">Cash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Short Note (Optional)</label>
                    <input
                      type="text"
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="e.g. Paid via UPI"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                    >
                      Submit Payment for Confirmation
                    </button>
                  </div>
                </form>
              )}

              {/* PURCHASE-WISE ALLOCATIONS & PAYMENT BREAKDOWN */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  Purchase-by-Purchase Allocation & Payment Ledger
                </h3>
                {householdPurchases.map((pur) => {
                  const buyer = memberMap.get(pur.purchased_by);
                  const allocs = householdAllocations.filter((a) => a.purchase_id === pur.id);
                  return (
                    <div
                      key={pur.id}
                      className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {pur.total_eggs} Eggs for {formatINR(pur.total_price_paise)}
                            </span>
                            <span className="text-xs text-slate-500">
                              ({formatINR(pur.cost_per_egg_paise)}/egg)
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                pur.allocation_status === 'finalized'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {pur.allocation_status === 'finalized' ? 'All Shares Accepted' : 'Pending Member Acceptance'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Purchased by <span className="font-semibold text-slate-800">{buyer?.name}</span> on{' '}
                            {formatDateIN(pur.purchase_date)} {pur.notes ? `· ${pur.notes}` : ''}
                          </div>
                        </div>

                        {(isAdmin || pur.purchased_by === currentMember.id) && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPurchase(pur);
                              setPurchaseEggs(pur.total_eggs);
                              setPurchasePriceINR(String(pur.total_price_paise / 100));
                              setPurchaseDate(pur.purchase_date);
                              setPurchasedById(pur.purchased_by);
                              setPurchaseNotes(pur.notes);
                              setSplitMode('custom');
                              setCustomAllocations(
                                allocs.map((a) => ({
                                  memberId: a.member_id,
                                  eggs: a.allocated_eggs,
                                  amountPaise: a.allocated_amount_paise
                                }))
                              );
                              setAddMode('purchase');
                              setActiveTab('add_eggs');
                            }}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Modify Split / Edit</span>
                          </button>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-500">
                              <th className="py-2 px-3 font-medium">Member</th>
                              <th className="py-2 px-3 font-medium">Egg Share</th>
                              <th className="py-2 px-3 font-medium">Money Share</th>
                              <th className="py-2 px-3 font-medium">Paid</th>
                              <th className="py-2 px-3 font-medium">Remaining</th>
                              <th className="py-2 px-3 font-medium">Approval</th>
                              <th className="py-2 px-3 font-medium">Payment Status</th>
                              <th className="py-2 px-3 font-medium text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {allocs.map((a) => {
                              const m = memberMap.get(a.member_id);
                              const rem = Math.max(0, a.allocated_amount_paise - a.paid_amount_paise);
                              const canPay =
                                a.member_id === currentMember.id &&
                                a.member_id !== pur.purchased_by &&
                                rem - a.pending_confirmation_paise > 0;
                              return (
                                <tr key={a.id}>
                                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                                    <span className="mr-1.5">{m?.avatar}</span>
                                    {m?.name}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700">{a.allocated_eggs} eggs</td>
                                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                                    {formatINR(a.allocated_amount_paise)}
                                  </td>
                                  <td className="py-2.5 px-3 text-emerald-700 font-semibold">
                                    {formatINR(a.paid_amount_paise)}
                                  </td>
                                  <td className="py-2.5 px-3 font-bold text-rose-600">{formatINR(rem)}</td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        a.approval_status === 'accepted'
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {a.approval_status === 'accepted' ? 'Accepted' : 'Pending'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        a.payment_status === 'Paid'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : a.payment_status === 'Partially Paid'
                                          ? 'bg-sky-100 text-sky-800'
                                          : a.payment_status === 'Waiting for Confirmation'
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-rose-100 text-rose-800'
                                      }`}
                                    >
                                      {a.payment_status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {a.member_id === currentMember.id && a.approval_status === 'pending' && (
                                      <button
                                        type="button"
                                        onClick={() => handleAcceptAllocation(a.id)}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold mr-1"
                                      >
                                        Accept
                                      </button>
                                    )}
                                    {canPay && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPayToMemberId(pur.purchased_by);
                                          setPayTargetAllocationId(a.id);
                                          setPayAmountINR(String((rem - a.pending_confirmation_paise) / 100));
                                          setPaymentModalOpen(true);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold"
                                      >
                                        Pay {formatINR(rem - a.pending_confirmation_paise)}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PAYMENT TRANSACTIONS & CONFIRMATION HISTORY */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <h3 className="text-base font-bold text-slate-900">Payment Records & Audit Trail</h3>
                {householdPayments.length === 0 ? (
                  <p className="text-xs text-slate-500">No payments recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-2 px-3 font-medium">Date</th>
                          <th className="py-2 px-3 font-medium">From</th>
                          <th className="py-2 px-3 font-medium">To (Purchaser)</th>
                          <th className="py-2 px-3 font-medium">Amount</th>
                          <th className="py-2 px-3 font-medium">Method & Note</th>
                          <th className="py-2 px-3 font-medium">Status</th>
                          <th className="py-2 px-3 font-medium text-right">Purchaser Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {householdPayments.map((pay) => {
                          const fromM = memberMap.get(pay.from_member_id);
                          const toM = memberMap.get(pay.to_member_id);
                          const canConfirm =
                            pay.status === 'Waiting for Confirmation' &&
                            (pay.to_member_id === currentMember.id || isAdmin);
                          return (
                            <tr key={pay.id}>
                              <td className="py-2.5 px-3 text-slate-600">{formatDateIN(pay.payment_date)}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">{fromM?.name}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">{toM?.name}</td>
                              <td className="py-2.5 px-3 font-extrabold text-slate-900">
                                {formatINR(pay.amount_paise)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">
                                {pay.payment_method} {pay.note ? `· ${pay.note}` : ''}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    pay.status === 'Confirmed'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : pay.status === 'Rejected'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {pay.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {canConfirm && (
                                  <div className="inline-flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmOrRejectPayment(pay, 'confirmed')}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold"
                                    >
                                      Confirm Received
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmOrRejectPayment(pay, 'rejected')}
                                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 5: MEMBERS & WEEKLY CONSUMPTION SCHEDULES
             ================================================================ */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              {/* Top Card: Increase Roommates & Household Capacity */}
              <div className="bg-emerald-50/80 rounded-3xl p-5 border border-emerald-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wide">
                      <Users className="w-4 h-4" />
                      <span>Scale Your Household Room ({activeMembers.length} Active / Capacity: {currentHousehold.expected_member_count})</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      Increase Roommates or Add New Members Anytime
                    </h2>
                    <p className="text-xs text-slate-600">
                      Add new roommates in one tap or share Room Code <span className="font-mono font-bold text-emerald-800">{currentHousehold.room_code}</span> (PIN: <span className="font-mono font-bold text-emerald-800">{currentHousehold.pin_code}</span>). Future purchases & exhaustion predictions automatically scale to {activeMembers.length} members.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickIncreaseMembers(1)}
                      className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>+1 Add Member {householdMembers.length + 1}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickIncreaseMembers(2)}
                      className="px-3.5 py-2.5 rounded-2xl bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition"
                    >
                      +2 Members
                    </button>
                  </div>
                </div>

                {/* Room Capacity Stepper & Optional Re-split Button */}
                <div className="pt-3 border-t border-emerald-200/70 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Planned Room Capacity:</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateRoomCapacity(currentHousehold.expected_member_count - 1)}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 rounded-lg bg-white border border-emerald-200 font-extrabold text-emerald-800">
                      {currentHousehold.expected_member_count} members
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateRoomCapacity(currentHousehold.expected_member_count + 1)}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>

                  {householdPurchases.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResplitLatestPurchaseWithAllActive}
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Re-split Latest Purchase Equally Across All {activeMembers.length} Active Members</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Edit Member Modal / Inline Editor */}
              {editingMember && (
                <form
                  onSubmit={handleSaveEditedMember}
                  className="bg-white rounded-3xl p-5 border-2 border-emerald-500 shadow-md space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Edit Member Profile</h3>
                    <button
                      type="button"
                      onClick={() => setEditingMember(null)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                      <input
                        type="text"
                        required
                        value={editingMember.name}
                        onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                      <select
                        value={editingMember.role}
                        onChange={(e) =>
                          setEditingMember({ ...editingMember, role: e.target.value as MemberRole })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Avatar</label>
                      <div className="flex gap-1 overflow-x-auto">
                        {AVATAR_OPTIONS.map((av) => (
                          <button
                            key={av}
                            type="button"
                            onClick={() => setEditingMember({ ...editingMember, avatar: av })}
                            className={`w-8 h-8 rounded-lg border text-sm shrink-0 ${
                              editingMember.avatar === av ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'
                            }`}
                          >
                            {av}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                  >
                    Save Member Changes
                  </button>
                </form>
              )}

              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Household Members & Weekly Consumption Schedules
                    </h2>
                    <p className="text-xs text-slate-500">
                      Configure each member&apos;s expected daily egg consumption (Mon–Sun). Used for smart purchase predictions, never automatic inventory deductions.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    Exhaustion Forecast:{' '}
                    {prediction.exhaustionDate
                      ? `${prediction.exhaustionDayName}, ${formatDateIN(prediction.exhaustionDate)}`
                      : 'Sufficient'}
                  </span>
                </div>

                {/* Weekly Schedule Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3 font-medium">Member</th>
                        {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((d) => (
                          <th key={d} className="py-2.5 px-2 font-medium text-center uppercase">
                            {d}
                          </th>
                        ))}
                        <th className="py-2.5 px-3 font-medium text-right">Weekly Total</th>
                        <th className="py-2.5 px-3 font-medium text-right">Status / Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {memberSummaries.map((item) => {
                        const m = item.member;
                        const sc = item.schedule || {
                          mon: m.default_daily_eggs,
                          tue: m.default_daily_eggs,
                          wed: m.default_daily_eggs,
                          thu: m.default_daily_eggs,
                          fri: m.default_daily_eggs,
                          sat: 0,
                          sun: 0
                        };
                        const weeklySum = sc.mon + sc.tue + sc.wed + sc.thu + sc.fri + sc.sat + sc.sun;
                        const canEditSched = isAdmin || m.id === currentMember.id;

                        return (
                          <tr key={m.id} className={m.status === 'left' ? 'opacity-60 bg-slate-50' : ''}>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{m.avatar}</span>
                                <div>
                                  <div className="font-bold text-slate-900">{m.name}</div>
                                  <div className="text-[10px] text-slate-500 capitalize">
                                    {m.role} · {m.status}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((dayKey) => (
                              <td key={dayKey} className="py-2 px-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={12}
                                  disabled={!canEditSched || m.status === 'left'}
                                  value={sc[dayKey]}
                                  onChange={(e) => handleUpdateSchedule(m.id, dayKey, Number(e.target.value))}
                                  className="w-12 py-1.5 text-center rounded-lg border border-slate-200 font-bold text-slate-900 disabled:bg-slate-100"
                                />
                              </td>
                            ))}
                            <td className="py-3 px-3 text-right font-bold text-emerald-700">
                              {weeklySum} eggs/wk
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingMember(m)}
                                  className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700"
                                  title="Edit Member Name or Avatar"
                                >
                                  Edit
                                </button>
                                {isAdmin && item.remainingDuePaise > 0 && m.status === 'left' && (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminSettleMemberDues(m)}
                                    className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-semibold"
                                  >
                                    Settle {formatINR(item.remainingDuePaise)}
                                  </button>
                                )}
                                {isAdmin && m.id !== currentMember.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleMemberStatus(m)}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700"
                                  >
                                    {m.status === 'active' ? 'Mark Left' : 'Reactivate'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add Custom Named Household Member */}
              {(isAdmin || activeMembers.length > 0) && (
                <form
                  onSubmit={handleAddMember}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4"
                >
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Add a New Roommate</h3>
                    <p className="text-xs text-slate-500">
                      New members are included in future purchase splits and are never assigned historical debts.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Member Name</label>
                      <input
                        type="text"
                        required
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        placeholder="e.g. Rohan"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Weekday Eggs Target</label>
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={newMemberDailyEggs}
                        onChange={(e) => setNewMemberDailyEggs(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Avatar</label>
                      <div className="flex gap-1 overflow-x-auto py-1">
                        {AVATAR_OPTIONS.slice(0, 6).map((av) => (
                          <button
                            key={av}
                            type="button"
                            onClick={() => setNewMemberAvatar(av)}
                            className={`w-9 h-9 rounded-xl border text-base ${
                              newMemberAvatar === av ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'
                            }`}
                          >
                            {av}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add Member to Room</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 6: REPORTS & VISUAL ANALYTICS
             ================================================================ */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {/* Report Filter Bar */}
              <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Household & Member Reports</h2>
                  <p className="text-xs text-slate-500">Live database metrics & visual charts</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'week', label: 'This Week' },
                    { id: 'month', label: 'This Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: 'all', label: 'All Time' },
                    { id: 'custom', label: 'Custom Range' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setReportFilter(f.id as typeof reportFilter)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                        reportFilter === f.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {reportFilter === 'custom' && (
                <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 mr-2">From:</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 mr-2">To:</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200"
                    />
                  </div>
                </div>
              )}

              {/* Household Report Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">Total Eggs Purchased</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-1">{filteredReportData.eggsBought}</div>
                  <span className="text-[11px] text-slate-500">
                    Spend: {formatINR(filteredReportData.purchaseAmountPaise)}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">Total Eggs Consumed</span>
                  <div className="text-xl font-extrabold text-emerald-700 mt-1">{filteredReportData.eggsConsumed}</div>
                  <span className="text-[11px] text-slate-500">
                    Remaining: {inventoryStats.availableEggs} eggs
                  </span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">Waste Quantity & Cost</span>
                  <div className="text-xl font-extrabold text-amber-700 mt-1">
                    {filteredReportData.wasteQty} eggs
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Waste expense: {formatINR(filteredReportData.wasteExpensePaise)}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">Est. Next Purchase</span>
                  <div className="text-lg font-extrabold text-slate-900 mt-1">
                    {prediction.exhaustionDate ? formatDateIN(prediction.exhaustionDate) : 'Sufficient'}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Avg daily: {prediction.dailyExpectedAverage} eggs/day
                  </span>
                </div>
              </div>

              {/* CHARTS ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Chart 1: Bar Chart for Member-wise Consumption */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Member-wise Egg Consumption vs Allocated Share</h3>
                    <p className="text-xs text-slate-500">Actual eggs eaten vs purchased share</p>
                  </div>
                  <div className="relative h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredReportData.memberBarData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Consumed" fill="#059669" radius={[6, 6, 0, 0]} name="Eggs Consumed" />
                        <Bar dataKey="Allocated" fill="#94a3b8" radius={[6, 6, 0, 0]} name="Allocated Share" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2: Line Chart for Daily Household Consumption & Inventory Depletion */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Daily Household Consumption & Inventory Run-out</h3>
                    <p className="text-xs text-slate-500">Day-by-day consumption vs remaining egg stock</p>
                  </div>
                  <div className="relative h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={filteredReportData.dailyTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="RemainingInventory"
                          stroke="#059669"
                          strokeWidth={3}
                          name="Remaining Eggs"
                        />
                        <Line
                          type="monotone"
                          dataKey="EggsUsedOrPlanned"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          name="Daily Eggs Used"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Chart 3: Simple Spending & Payment Comparison */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Member Spending & Settlement Comparison (₹)</h3>
                  <p className="text-xs text-slate-500">Purchase Share (₹) vs Confirmed Paid (₹) vs Remaining Due (₹)</p>
                </div>
                <div className="relative h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredReportData.memberBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="ShareINR" fill="#0284c7" radius={[6, 6, 0, 0]} name="Purchase Share (₹)" />
                      <Bar dataKey="PaidINR" fill="#059669" radius={[6, 6, 0, 0]} name="Confirmed Paid (₹)" />
                      <Bar dataKey="DueINR" fill="#e11d48" radius={[6, 6, 0, 0]} name="Remaining Due (₹)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Member Report Table */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <h3 className="text-base font-bold text-slate-900">Detailed Member Financial & Consumption Table</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3 font-medium">Member</th>
                        <th className="py-2.5 px-3 font-medium">Eggs Consumed</th>
                        <th className="py-2.5 px-3 font-medium">Consumption Value (FIFO)</th>
                        <th className="py-2.5 px-3 font-medium">Purchase Share</th>
                        <th className="py-2.5 px-3 font-medium">Amount Paid</th>
                        <th className="py-2.5 px-3 font-medium">Amount Due</th>
                        <th className="py-2.5 px-3 font-medium">Monthly Purchase Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {memberSummaries.map((s) => (
                        <tr key={s.member.id}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {s.member.avatar} {s.member.name}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{s.eggsUsed} eggs</td>
                          <td className="py-2.5 px-3 text-sky-700 font-medium">
                            {formatINR(s.fifoConsumptionValuePaise)}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {formatINR(s.purchaseSharePaise)}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-700">
                            {formatINR(s.confirmedPaidPaise)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-rose-600">
                            {formatINR(s.remainingDuePaise)}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {formatINR(s.purchaseSharePaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TAB 7: SETTINGS, CSV EXPORT, SCENARIO RUNNER & POSTGRESQL SCHEMA
             ================================================================ */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Room Settings & Smart Prediction Configuration */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Room & Smart Reminder Settings</h2>
                    <p className="text-xs text-slate-500">
                      Configure low-stock threshold, purchase reminder lead time, and prediction engine.
                    </p>
                  </div>
                  <span className="text-xs font-mono bg-slate-100 px-3 py-1 rounded-xl font-semibold text-slate-700">
                    Room Code: {currentHousehold.room_code} · PIN: {currentHousehold.pin_code}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Low-Stock Threshold (Eggs)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      disabled={!isAdmin}
                      value={currentSettings.low_stock_threshold}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        setDb((prev) => ({
                          ...prev,
                          household_settings: prev.household_settings.map((s) =>
                            s.household_id === currentHousehold.id ? { ...s, low_stock_threshold: val } : s
                          )
                        }));
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                    />
                    <span className="text-[10px] text-slate-400">Triggers low-stock badge when inventory ≤ threshold</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reminder Lead Time (Days Before Shortage)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      disabled={!isAdmin}
                      value={currentSettings.reminder_lead_days}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value));
                        setDb((prev) => ({
                          ...prev,
                          household_settings: prev.household_settings.map((s) =>
                            s.household_id === currentHousehold.id ? { ...s, reminder_lead_days: val } : s
                          )
                        }));
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                    />
                    <span className="text-[10px] text-slate-400">Default: 3 days before predicted exhaustion</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Prediction Mode</label>
                    <select
                      disabled={!isAdmin}
                      value={currentSettings.prediction_mode}
                      onChange={(e) => {
                        const mode = e.target.value as PredictionMode;
                        setDb((prev) => ({
                          ...prev,
                          household_settings: prev.household_settings.map((s) =>
                            s.household_id === currentHousehold.id ? { ...s, prediction_mode: mode } : s
                          )
                        }));
                        showToast(`Updated prediction mode to ${mode === 'schedule' ? 'Configured Weekly Schedule' : 'Recent Actual Average'}.`);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white font-medium"
                    >
                      <option value="schedule">Configured Weekly Schedule (Default)</option>
                      <option value="actual_average">Recent Actual Consumption Average</option>
                    </select>
                  </div>
                </div>

                {/* Browser Notifications Permission Section */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">
                      In-App & Browser Push Notifications
                    </div>
                    <p className="text-[11px] text-slate-500">
                      All notifications are persisted in the database so every roommate sees them across devices. Browser notifications are used when permitted by your browser.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !currentSettings.browser_notifications_enabled;
                      setDb((prev) => ({
                        ...prev,
                        household_settings: prev.household_settings.map((s) =>
                          s.household_id === currentHousehold.id
                            ? { ...s, browser_notifications_enabled: nextState }
                            : s
                        )
                      }));
                      showToast(
                        nextState
                          ? 'Enabled browser & persistent in-app notifications.'
                          : 'Using persistent in-app notifications only.'
                      );
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition ${
                      currentSettings.browser_notifications_enabled
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    {currentSettings.browser_notifications_enabled ? 'Notifications Enabled' : 'Enable Browser Alerts'}
                  </button>
                </div>
              </div>

              {/* Data Export to CSV */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Export Household Data to CSV</h3>
                  <p className="text-xs text-slate-500">
                    Download clean spreadsheets of your household purchases, consumption logs, payments, or member summary.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleExportCSV('summary')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Member Summary CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCSV('purchases')}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Purchases CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCSV('consumption')}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Consumption Logs CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCSV('payments')}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Payments Audit CSV</span>
                  </button>
                </div>
              </div>

              {/* Supabase Backend Connection & Browser-Only GitHub + Vercel Guide */}
              <div className="bg-white rounded-3xl p-5 border border-emerald-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wide">
                      <Database className="w-4 h-4" />
                      <span>Supabase PostgreSQL Cloud Sync & Vercel Setup</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">
                      Connect Live Supabase Backend (Or Use Vercel Environment Variables)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Set <span className="font-mono font-semibold">VITE_SUPABASE_URL</span> and <span className="font-mono font-semibold">VITE_SUPABASE_ANON_KEY</span> in Vercel, or paste them below to sync across all roommates&apos; phones.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySqlSchema}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SQL for Supabase Editor</span>
                  </button>
                </div>

                <form onSubmit={handleSaveSupabaseConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supabase Project URL (VITE_SUPABASE_URL)
                    </label>
                    <input
                      type="url"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://xyzcompany.supabase.co"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supabase Anon Public Key (VITE_SUPABASE_ANON_KEY)
                    </label>
                    <input
                      type="password"
                      value={supabaseAnonKey}
                      onChange={(e) => setSupabaseAnonKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                      >
                        Save Keys
                      </button>
                      <button
                        type="button"
                        onClick={handlePushToSupabase}
                        className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold"
                      >
                        Push Room to Supabase
                      </button>
                      <button
                        type="button"
                        onClick={handlePullFromSupabase}
                        className="px-4 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-semibold"
                      >
                        Pull Room from Supabase
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Status: <strong className="capitalize text-slate-800">{cloudSyncStatus}</strong>
                    </span>
                  </div>
                </form>
              </div>

              {/* Section 18 Testing Scenario & PostgreSQL Schema Inspector */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Testing Scenarios & PostgreSQL Database Architecture
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verify the Section 18 end-to-end roommate scenario, test multi-purchase FIFO payments, or inspect the 12 normalized PostgreSQL tables.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Remove Demo Data & Start Fresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSection18Scenario}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Reset to Section 18 Final Testing Scenario</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadMultiPurchaseScenario}
                    className="px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Load Multi-Purchase FIFO Test (₹280 + ₹320)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSqlModalOpen(!sqlModalOpen)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Database className="w-4 h-4" />
                    <span>{sqlModalOpen ? 'Hide' : 'Inspect'} 12-Table PostgreSQL & RLS Schema</span>
                  </button>
                </div>

                {sqlModalOpen && (
                  <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 text-xs font-mono space-y-2 overflow-x-auto">
                    <div className="text-emerald-400 font-bold">
                      -- Normalized 12-Table PostgreSQL + Supabase RLS Live Row Counts
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                      <div className="bg-slate-800 p-2 rounded-lg">1. households: {db.households.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">2. household_members: {db.household_members.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">3. purchases: {db.purchases.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">4. purchase_allocations: {db.purchase_allocations.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">5. consumption_logs: {db.consumption_logs.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">6. inventory_batches: {db.inventory_batches.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">7. payment_records: {db.payment_records.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">8. payment_confirmations: {db.payment_confirmations.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">9. member_schedules: {db.member_schedules.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">10. notifications: {db.notifications.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">11. household_settings: {db.household_settings.length}</div>
                      <div className="bg-slate-800 p-2 rounded-lg">12. activity_logs: {db.activity_logs.length}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Room Switcher / Logout */}
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Switch Household Room or Sign Out</h3>
                  <p className="text-xs text-slate-500">
                    Create a new household room, join another room with Room Code + PIN, or switch active member profile.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRoomSwitcherOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                  >
                    Switch / Create Room
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSession(null);
                      showToast('Signed out of household session.', 'info');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ====================================================================
          START FRESH / REMOVE DEMO DATA CONFIRMATION MODAL
         ==================================================================== */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Remove Demo Data & Start Fresh</h3>
                  <p className="text-xs text-slate-500">Choose how you want to reset EggMate</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 space-y-2">
                <div className="text-xs font-bold text-emerald-950">
                  Option 1: Keep This Room & Members, Clear All Demo Records
                </div>
                <p className="text-[11px] text-slate-600">
                  Removes the demo 40-egg purchase, consumption entries, and ₹50 payment so your current room ({currentHousehold.name}) starts fresh at 0 eggs and ₹0 balance.
                </p>
                <button
                  type="button"
                  onClick={handleClearDemoRecordsKeepRoom}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                >
                  Clear Demo Records (Start Room at 0 Eggs)
                </button>
              </div>

              <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/60 space-y-2">
                <div className="text-xs font-bold text-rose-950">
                  Option 2: Full Factory Reset (Delete Demo Room & Create Your Own)
                </div>
                <p className="text-[11px] text-slate-600">
                  Deletes the demo room ({currentHousehold.name}) completely and opens the Create Room screen so you can enter your own flat name, PIN, and roommates from scratch.
                </p>
                <button
                  type="button"
                  onClick={handleFullFactoryReset}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition"
                >
                  Delete Demo Room & Start From Scratch
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setResetModalOpen(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          ROOM & PROFILE SWITCHER MODAL
         ==================================================================== */}
      {roomSwitcherOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Household Rooms & Member Profiles</h3>
              <button
                type="button"
                onClick={() => setRoomSwitcherOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setAuthTab('switch')}
                className={`py-2 rounded-lg ${authTab === 'switch' ? 'bg-white text-emerald-700 shadow-xs font-semibold' : 'text-slate-600'}`}
              >
                Switch Profile
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('join')}
                className={`py-2 rounded-lg ${authTab === 'join' ? 'bg-white text-emerald-700 shadow-xs font-semibold' : 'text-slate-600'}`}
              >
                Join Room
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('create')}
                className={`py-2 rounded-lg ${authTab === 'create' ? 'bg-white text-emerald-700 shadow-xs font-semibold' : 'text-slate-600'}`}
              >
                Create Room
              </button>
            </div>

            {authTab === 'switch' && (
              <div className="space-y-3">
                {db.households.map((h) => {
                  const rMembers = db.household_members.filter((m) => m.household_id === h.id && m.status === 'active');
                  return (
                    <div key={h.id} className="border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-slate-900">{h.name}</div>
                          <div className="text-[11px] text-slate-500">
                            Code: <span className="font-mono font-semibold text-emerald-700">{h.room_code}</span> · PIN: {h.pin_code}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {rMembers.map((m) => {
                          const isCurrent = session.householdId === h.id && session.memberId === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSession({ householdId: h.id, memberId: m.id });
                                setRoomSwitcherOpen(false);
                                showToast(`Switched to ${m.name} (${h.name})`);
                              }}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                                isCurrent
                                  ? 'border-emerald-600 bg-emerald-50 font-semibold'
                                  : 'border-slate-200 hover:border-emerald-400'
                              }`}
                            >
                              <span className="text-lg">{m.avatar}</span>
                              <div className="overflow-hidden">
                                <div className="text-xs font-semibold text-slate-900 truncate">{m.name}</div>
                                <div className="text-[10px] text-slate-500 capitalize">{m.role}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {authTab === 'join' && (
              <form onSubmit={handleJoinRoom} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Room Code</label>
                  <input
                    type="text"
                    required
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Household PIN</label>
                  <input
                    type="password"
                    required
                    value={joinRoomPin}
                    onChange={(e) => setJoinRoomPin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={joinMemberName}
                    onChange={(e) => setJoinMemberName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs"
                >
                  Join Room
                </button>
              </form>
            )}

            {authTab === 'create' && (
              <form onSubmit={handleCreateRoom} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">New Room Name</label>
                  <input
                    type="text"
                    required
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Koramangala Apt 204"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Your Name (Admin)</label>
                    <input
                      type="text"
                      required
                      value={newRoomAdminName}
                      onChange={(e) => setNewRoomAdminName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Household PIN</label>
                    <input
                      type="text"
                      required
                      value={newRoomPin}
                      onChange={(e) => setNewRoomPin(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs"
                >
                  Create Household Room
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MOBILE FIXED BOTTOM NAVIGATION BAR (Home, My Eggs, Add Eggs, Payments, More)
         ==================================================================== */}
      {moreMenuOpen && (
        <div className="md:hidden fixed inset-x-0 bottom-16 z-40 bg-white border-t border-slate-200 shadow-lg rounded-t-3xl p-4 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase">More Sections</span>
            <button
              type="button"
              onClick={() => setMoreMenuOpen(false)}
              className="text-xs text-slate-500 p-1"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('members');
                setMoreMenuOpen(false);
              }}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1 text-xs font-semibold ${
                activeTab === 'members'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 text-slate-700'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Members</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('reports');
                setMoreMenuOpen(false);
              }}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1 text-xs font-semibold ${
                activeTab === 'reports'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 text-slate-700'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span>Reports</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('settings');
                setMoreMenuOpen(false);
              }}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1 text-xs font-semibold ${
                activeTab === 'settings'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 text-slate-700'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 py-1.5 grid grid-cols-5 gap-1">
        <button
          type="button"
          onClick={() => {
            setActiveTab('home');
            setMoreMenuOpen(false);
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[11px] font-medium ${
            activeTab === 'home' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('my_eggs');
            setMoreMenuOpen(false);
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[11px] font-medium ${
            activeTab === 'my_eggs' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <Egg className="w-5 h-5 mb-0.5" />
          <span>My Eggs</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAddMode('consume');
            setActiveTab('add_eggs');
            setMoreMenuOpen(false);
          }}
          className="flex flex-col items-center justify-center py-1 rounded-2xl bg-emerald-600 text-white font-bold text-[11px] shadow-xs"
        >
          <PlusCircle className="w-5 h-5 mb-0.5" />
          <span>Add Eggs</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('payments');
            setMoreMenuOpen(false);
          }}
          className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl text-[11px] font-medium ${
            activeTab === 'payments' ? 'text-emerald-700 font-bold' : 'text-slate-500'
          }`}
        >
          <Wallet className="w-5 h-5 mb-0.5" />
          <span>Payments</span>
          {pendingConfirmationsForMe.length > 0 && (
            <span className="absolute top-1 right-4 w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setMoreMenuOpen(!moreMenuOpen)}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[11px] font-medium ${
            ['members', 'reports', 'settings'].includes(activeTab) || moreMenuOpen
              ? 'text-emerald-700 font-bold'
              : 'text-slate-500'
          }`}
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
