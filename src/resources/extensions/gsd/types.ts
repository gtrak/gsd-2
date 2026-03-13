// GSD Extension — Core Type Definitions
// Types consumed by state derivation, file parsing, and status display.
// Pure interfaces — no logic, no runtime dependencies.

// ─── Enums & Literal Unions ────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';
export type Phase = 'pre-planning' | 'discussing' | 'researching' | 'planning' | 'executing' | 'reviewing' | 'fixing' | 'verifying' | 'summarizing' | 'advancing' | 'completing-milestone' | 'replanning-slice' | 'complete' | 'paused' | 'blocked';
export type ContinueStatus = 'in_progress' | 'interrupted' | 'compacted';

// ─── Roadmap (Milestone-level) ─────────────────────────────────────────────

export interface RoadmapSliceEntry {
  id: string;          // e.g. "S01"
  title: string;       // e.g. "Types + File I/O + Git Operations"
  risk: RiskLevel;
  depends: string[];   // e.g. ["S01", "S02"]
  done: boolean;
  demo: string;        // the "After this:" sentence
}

export interface BoundaryMapEntry {
  fromSlice: string;   // e.g. "S01"
  toSlice: string;     // e.g. "S02" or "terminal"
  produces: string;    // raw text block of what this slice produces
  consumes: string;    // raw text block of what it consumes (or "nothing")
}

export interface Roadmap {
  title: string;       // e.g. "M001: GSD Extension — Hierarchical Planning with Auto Mode"
  vision: string;
  successCriteria: string[];
  slices: RoadmapSliceEntry[];
  boundaryMap: BoundaryMapEntry[];
}

// ─── Slice Plan ────────────────────────────────────────────────────────────

export interface TaskPlanEntry {
  id: string;          // e.g. "T01"
  title: string;       // e.g. "Core Type Definitions"
  description: string;
  done: boolean;
  estimate: string;    // e.g. "30m", "2h" — informational only
  files?: string[];    // e.g. ["types.ts", "files.ts"] — extracted from "- Files:" subline
  verify?: string;     // e.g. "run tests" — extracted from "- Verify:" subline
}

export interface SlicePlan {
  id: string;          // e.g. "S01"
  title: string;       // from the H1
  goal: string;
  demo: string;
  mustHaves: string[]; // top-level must-have bullet points
  tasks: TaskPlanEntry[];
  filesLikelyTouched: string[];
}

// ─── Summary (Task & Slice level) ──────────────────────────────────────────

export interface SummaryRequires {
  slice: string;
  provides: string;
}

export interface SummaryFrontmatter {
  id: string;
  parent: string;
  milestone: string;
  provides: string[];
  requires: SummaryRequires[];
  affects: string[];
  key_files: string[];
  key_decisions: string[];
  patterns_established: string[];
  drill_down_paths: string[];
  observability_surfaces: string[];
  duration: string;
  verification_result: string;
  completed_at: string;
  blocker_discovered: boolean;
}

export interface FileModified {
  path: string;
  description: string;
}

export interface Summary {
  frontmatter: SummaryFrontmatter;
  title: string;
  oneLiner: string;
  whatHappened: string;
  deviations: string;
  filesModified: FileModified[];
}

// ─── Continue-Here ─────────────────────────────────────────────────────────

export interface ContinueFrontmatter {
  milestone: string;
  slice: string;
  task: string;
  step: number;
  totalSteps: number;
  status: ContinueStatus;
  savedAt: string;
}

export interface Continue {
  frontmatter: ContinueFrontmatter;
  completedWork: string;
  remainingWork: string;
  decisions: string;
  context: string;
  nextAction: string;
}

// ─── Secrets Manifest ──────────────────────────────────────────────────────

export type SecretsManifestEntryStatus = 'pending' | 'collected' | 'skipped';

export interface SecretsManifestEntry {
  key: string;              // e.g. "OPENAI_API_KEY"
  service: string;          // e.g. "OpenAI"
  dashboardUrl: string;     // e.g. "https://platform.openai.com/api-keys" — empty if unknown
  guidance: string[];       // numbered setup steps
  formatHint: string;       // e.g. "starts with sk-" — empty if unknown
  status: SecretsManifestEntryStatus;
  destination: string;      // e.g. "dotenv", "vercel", "convex"
}

export interface SecretsManifest {
  milestone: string;        // e.g. "M001"
  generatedAt: string;      // ISO 8601 timestamp
  entries: SecretsManifestEntry[];
}

// ─── GSD State (Derived Dashboard) ────────────────────────────────────────

export interface ActiveRef {
  id: string;
  title: string;
}

export interface MilestoneRegistryEntry {
  id: string;
  title: string;
  status: 'complete' | 'active' | 'pending';
  /** Milestone IDs that must be complete before this milestone becomes active. Populated from CONTEXT.md YAML frontmatter. */
  dependsOn?: string[];
}

export interface RequirementCounts {
  active: number;
  validated: number;
  deferred: number;
  outOfScope: number;
  blocked: number;
  total: number;
}

export interface GSDState {
  activeMilestone: ActiveRef | null;
  activeSlice: ActiveRef | null;
  activeTask: ActiveRef | null;
  phase: Phase;
  recentDecisions: string[];
  blockers: string[];
  nextAction: string;
  activeBranch?: string;
  registry: MilestoneRegistryEntry[];
  requirements?: RequirementCounts;
  progress?: {
    milestones: { done: number; total: number };
    slices?: { done: number; total: number };
    tasks?: { done: number; total: number };
  };
  extensions?: Record<string, unknown>;
}

// ─── Code Review Types ───────────────────────────────────────────────────────

export type ReviewSeverity = 'critical' | 'major' | 'minor';

export type ReviewStatus = 'STILL_OPEN' | 'FIXED';

export interface ReviewIssue {
  id: string;              // e.g. "C-1", "M-1", "m-1"
  severity: ReviewSeverity;
  description: string;
  location: string;        // e.g., "src/auth/logout.js:15"
  category: string;        // Plan Drift, Partial Implementation, Bug, Security, etc.
  status?: ReviewStatus;   // From previous review cycles
  fix?: string;
}

export interface ReviewSummary {
  previousFixed: { critical: number; major: number; minor: number };
  previousRemaining: { critical: number; major: number; minor: number };
  newIssues: { critical: number; major: number; minor: number };
  totalOpen: { critical: number; major: number; minor: number };
  previousFixedTotal?: number;
  previousRemainingTotal?: number;
}

export interface CodeReview {
  cycle: number;           // 1-5
  date: string;
  taskId: string;
  taskTitle: string;
  previousIssues: ReviewIssue[];  // from previous review cycle
  currentIssues: ReviewIssue[];  // found this cycle
  summary: ReviewSummary;
  status: 'ISSUES_RESOLVED' | string;  // e.g., "CYCLE_2"
}

export interface ReviewState {
  activeTaskId: string | null;
  cycle: number;            // current review cycle (1-5)
  status: 'pending_review' | 'fixing';  // review phase
  issues: ReviewIssue[];    // cumulative across cycles
  lastReviewPath: string | null;
};

export type ReviewIssueCategory =
  | 'Plan Drift'
  | 'Partial Implementation'
  | 'Incomplete Stubs'
  | 'Useless Tests'
  | 'Duplicate Tests'
  | 'Code Quality'
  | 'Bugs'
  | 'Security'
  | 'Performance'
  | 'Best Practices';
