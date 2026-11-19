import { create } from 'zustand';
import { api, type Profile, type Progress, type Reward } from './api';
import { sfx } from './sfx';

export type PanelId =
  | { kind: 'academy'; stream: 'network' | 'cloud' | 'forex' | 'dev'; lessonId?: string; chapterId?: string; boss?: boolean }
  | { kind: 'netlab'; labId?: string }
  | { kind: 'shelllab'; labId?: string; profile?: 'linux' | 'cloud' | 'hpc' | 'vm' | 'dev' }
  | { kind: 'rack' }
  | { kind: 'pcbuild' }
  | { kind: 'cable' }
  | { kind: 'trading' }
  | { kind: 'exam'; tab?: 'exam' | 'drills' | 'cards' }
  | { kind: 'profile' }
  | { kind: 'quest' }
  | { kind: 'help' };

export interface Toast {
  id: number;
  text: string;
  icon?: string;
  tone?: 'xp' | 'achievement' | 'level' | 'error' | 'info';
}

interface GameState {
  profile: Profile | null;
  progress: Progress | null;
  panel: PanelId | null;
  started: boolean;
  nearZone: string | null;
  toasts: Toast[];
  pointerLocked: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  open: (p: PanelId | null) => void;
  setStarted: (v: boolean) => void;
  setNearZone: (z: string | null) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  reward: (r: Reward | undefined | null, label?: string) => void;
  completedLessons: () => Set<string>;
}

let toastId = 1;

export const useGame = create<GameState>((set, get) => ({
  profile: null,
  progress: null,
  panel: null,
  started: false,
  nearZone: null,
  toasts: [],
  pointerLocked: false,
  load: async () => {
    const [profile, progress] = await Promise.all([api.profile(), api.progress()]);
    set({ profile, progress });
  },
  refresh: async () => {
    const [profile, progress] = await Promise.all([api.profile(), api.progress()]);
    set({ profile, progress });
  },
  open: (p) => {
    set({ panel: p });
    if (p) sfx('open');
  },
  setStarted: (v) => set({ started: v }),
  setNearZone: (z) => {
    if (get().nearZone !== z) set({ nearZone: z });
  },
  toast: (t) => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== id) }), t.tone === 'achievement' || t.tone === 'level' ? 6000 : 3500);
  },
  reward: (r, label) => {
    if (!r) return;
    const { toast } = get();
    if (r.xp > 0) {
      toast({ text: `+${r.xp} XP${label ? ` - ${label}` : ''}`, tone: 'xp', icon: '⭐' });
      sfx('xp');
    }
    for (const a of r.achievements ?? []) {
      toast({ text: `Achievement unlocked: ${a.title} (+${a.xp} XP)`, tone: 'achievement', icon: a.icon });
      sfx('achievement');
    }
    if (r.levelUp) {
      toast({ text: `LEVEL UP! ${r.levelUp.stream.toUpperCase()} level ${r.levelUp.to}`, tone: 'level', icon: '🆙' });
      sfx('level');
    }
    void get().refresh();
  },
  completedLessons: () => new Set((get().progress?.lessons ?? []).filter((l) => l.status === 'completed').map((l) => l.lesson_id)),
}));
