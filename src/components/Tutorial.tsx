import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bomb,
  CheckCircle2,
  Coins,
  Crosshair,
  Flag,
  Handshake,
  Lightbulb,
  RadioTower,
  Rocket,
  Shield,
  Timer,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import { audio } from '../services/audio';
import { tutorialScenarioMeta } from '../services/tutorialScenarios';
import type { TutorialScenarioId } from '../services/tutorialScenarios';

interface TutorialProps {
  onExit: () => void;
  onStartScenario?: (scenarioId: TutorialScenarioId) => void;
}

type TutorialLevel = {
  id: TutorialScenarioId;
  subtitle: string;
  icon: React.ReactNode;
  scenario: string;
  success: string;
  tips: string[];
};

const COMPLETED_STORAGE_KEY = 'space_conquererz_2_tutorial_completed_v2';

const tutorialLevels: TutorialLevel[] = [
  {
    id: 'real-time-basics',
    subtitle: 'Learn the new no-turn command flow, timers, income ticks, and queue behavior.',
    icon: <Timer className="h-5 w-5" />,
    scenario: 'You start on Helios Command with credits, ships, troops, a shipyard, and nearby planets to inspect while the real-time systems keep running.',
    success: 'You understand where to find income, upkeep, action timers, and the Exit Tutorial control.',
    tips: [
      'The screen can update quickly, but official saves are versioned so old states should not overwrite newer actions.',
      'Real-time does not mean every action is instant. Movement, construction, combat, and cooldowns still take time.'
    ]
  },
  {
    id: 'colonize',
    subtitle: 'Claim neutral planets while movement and colonization run as real-time actions.',
    icon: <Flag className="h-5 w-5" />,
    scenario: 'New Dawn has a Colony Ship and an escort. Vega Outpost is empty and connected, so it is ready to be claimed.',
    success: 'The neutral planet changes to your color and becomes a Colony.',
    tips: [
      'Colony Ships are weak and do not block enemy movement.',
      'You can start another order while colonization is counting down.'
    ]
  },
  {
    id: 'development-economy',
    subtitle: 'Use upgraded surrounding planets to unlock Arcology and Coreworld development.',
    icon: <Coins className="h-5 w-5" />,
    scenario: 'Capital Arcology is surrounded by upgraded friendly planets, showing how the high-level development requirement works.',
    success: 'You can explain why the linked upgraded planets matter and how development raises revenue.',
    tips: [
      'Arcology and Coreworld upgrades are strongest near clusters of developed friendly worlds.',
      'More economy gives more income, but large fleets and armies reduce net income through upkeep.'
    ]
  },
  {
    id: 'infrastructure',
    subtitle: 'Build shipyards, FTL inhibitors, and gateways without the old phase system.',
    icon: <Wrench className="h-5 w-5" />,
    scenario: 'Forge Station is ready to build infrastructure. Bastion Gate shows a completed defensive chokepoint.',
    success: 'You know where to queue infrastructure and what each structure is for.',
    tips: [
      'Shipyards are for production and faster repairs.',
      'FTL inhibitors slow enemy breakthroughs, but only if you can defend the planet.'
    ]
  },
  {
    id: 'fleet-controls',
    subtitle: 'Move whole fleets, specific ship types, and fully load carriers.',
    icon: <Rocket className="h-5 w-5" />,
    scenario: 'Rally Shipyard has Battleships, Destroyers, a Carrier, a Colony Ship, and enough ground units to practice the new controls.',
    success: 'You can move all ships, move by type, expand ship lists, and load a carrier with one button.',
    tips: [
      'Use ship-type movement when you want Battleships to reinforce but Colony Ships to stay safe.',
      'Fully Load Carrier takes up to 3 troops from the planet immediately.'
    ]
  },
  {
    id: 'space-combat',
    subtitle: 'Use timed auto attack without making large battles resolve instantly.',
    icon: <Crosshair className="h-5 w-5" />,
    scenario: 'Both fleets are already at Clash Point. Reinforcements wait at Reserve Dock so you can practice timing.',
    success: 'Enemy combat ships are destroyed or you intentionally stop auto attack to wait for reinforcements.',
    tips: [
      'Auto attack can be toggled off by pressing Stop Auto Attack.',
      'Large battles should take enough time for reinforcement decisions.'
    ]
  },
  {
    id: 'invasion',
    subtitle: 'Capture NPC planets with carriers and timed ground combat.',
    icon: <Shield className="h-5 w-5" />,
    scenario: 'A loaded Carrier is already above Garrison World (NPC), which has defending ground troops but no hostile ships in orbit.',
    success: 'The NPC defenders are defeated, the planet flips to you, and “(NPC)” disappears from the name.',
    tips: [
      'Ships cannot capture planets by themselves. You need surviving ground troops.',
      'Auto invade and auto ground combat should run in timed rounds, not instantly.'
    ]
  },
  {
    id: 'orbital-bombardment',
    subtitle: 'Soften defenders with paced auto bombardment and 10-second ship cooldowns.',
    icon: <Bomb className="h-5 w-5" />,
    scenario: 'Your ships are above Bombardment Range with enemy ground troops below and no enemy ships in orbit.',
    success: 'You can start and stop auto bombardment and understand why every ship waits on its own cooldown.',
    tips: [
      'Auto bombard fires paced shots about every 2.5 seconds when ships are ready.',
      'Bombardment cannot replace carriers if you need to actually claim the planet.'
    ]
  },
  {
    id: 'diplomacy-upkeep',
    subtitle: 'Accept alliance requests and read gross income, upkeep, and net income.',
    icon: <Handshake className="h-5 w-5" />,
    scenario: 'A Rival Empire alliance request is already waiting, and your fleet is large enough to show meaningful upkeep.',
    success: 'You respond to the alliance request and can explain your economy tooltip.',
    tips: [
      'Alliances should require the other player to accept or decline.',
      'Allied ships should not be treated as hostile for movement, invasions, or auto-fire.'
    ]
  },
  {
    id: 'advanced-warfare',
    subtitle: 'Combine chokepoints, reinforcements, auto combat, bombardment, and invasion.',
    icon: <RadioTower className="h-5 w-5" />,
    scenario: 'You have a fortified Bastion Gate, reinforcements in Reserve Dock, and an enemy Bulwark to break through.',
    success: 'You can plan a full real-time attack instead of clicking every system randomly.',
    tips: [
      'Good timing matters: start combat, move reinforcements, stop auto combat if needed, then invade.',
      'The strongest fleets still need economy and ground troops behind them.'
    ]
  }
];

function loadCompletedLessons(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COMPLETED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const Tutorial: React.FC<TutorialProps> = ({ onExit, onStartScenario }) => {
  const [levelIndex, setLevelIndex] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>(loadCompletedLessons);
  const level = tutorialLevels[levelIndex];
  const meta = tutorialScenarioMeta[level.id];

  useEffect(() => {
    try {
      localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completed));
    } catch {
      // Ignore private browsing storage failures.
    }
  }, [completed]);

  const completedCount = useMemo(() => Object.values(completed).filter(Boolean).length, [completed]);

  const goToLevel = (index: number) => {
    audio.playBeep(620, 0.05);
    setLevelIndex(index);
  };

  const markComplete = () => {
    audio.playBuild();
    setCompleted(prev => ({ ...prev, [level.id]: true }));
  };

  const clearMarks = () => {
    audio.playBeep(220, 0.08);
    setCompleted({});
  };

  const next = () => {
    audio.playBeep(700, 0.05);
    setLevelIndex(i => Math.min(tutorialLevels.length - 1, i + 1));
  };

  const previous = () => {
    audio.playBeep(500, 0.05);
    setLevelIndex(i => Math.max(0, i - 1));
  };

  const launchLesson = () => {
    if (!onStartScenario) return;
    audio.playVictory();
    onStartScenario(level.id);
  };

  return (
    <div className="glass-panel rounded-lg border border-slate-800/80 overflow-hidden animate-fadeIn max-h-[82vh] flex flex-col">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-800 bg-slate-950/70">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-400">Training Academy</p>
          <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-100">Real-Time Tutorial System</h2>
          <p className="text-xs text-slate-400 mt-1">Progress saves on this browser, so marked lessons stay done when you come back.</p>
        </div>
        <button
          onClick={onExit}
          className="scifi-btn scifi-btn-danger px-3 py-2 flex items-center gap-2"
          title="Exit tutorial"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">Exit</span>
        </button>
      </div>

      <div className="grid md:grid-cols-[265px_1fr] min-h-0 flex-1">
        <aside className="border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/50 p-3 overflow-x-auto md:overflow-y-auto">
          <div className="flex md:flex-col gap-2 min-w-max md:min-w-0">
            {tutorialLevels.map((item, index) => {
              const active = index === levelIndex;
              const done = completed[item.id];
              const itemMeta = tutorialScenarioMeta[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => goToLevel(index)}
                  className={`text-left rounded border px-3 py-3 min-w-[230px] md:min-w-0 transition-all ${
                    active
                      ? 'border-cyan-400/70 bg-cyan-950/30 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.15)]'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={active ? 'text-cyan-300' : 'text-slate-500'}>{item.icon}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">L{index + 1} — {itemMeta.title}</span>
                    {done && <CheckCircle2 className="h-4 w-4 ml-auto text-emerald-400" />}
                  </div>
                  <p className="text-[10px] mt-1 opacity-70 leading-snug normal-case font-sans">{item.subtitle}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="p-4 sm:p-6 overflow-y-auto space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start gap-5">
            <div className="flex-1 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-950/20 text-cyan-300 shrink-0">
                  {level.icon}
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-slate-100">Level {levelIndex + 1} — {meta.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{level.subtitle}</p>
                </div>
              </div>

              <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/10 p-4">
                <div className="flex items-center gap-2 mb-2 text-cyan-300">
                  <Zap className="h-4 w-4" />
                  <p className="text-[10px] font-mono uppercase tracking-widest">Opening briefing</p>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{meta.intro}</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded border border-indigo-500/30 bg-indigo-950/20 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-indigo-300 mb-1">Objective</p>
                  <p className="text-sm text-slate-200 leading-relaxed">{meta.objective}</p>
                </div>
                <div className="rounded border border-slate-700/70 bg-slate-950/50 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Playable setup</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{level.scenario}</p>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-64 rounded-lg border border-slate-800 bg-slate-950/70 p-4 relative overflow-hidden">
              <div className="absolute inset-0 opacity-40 starfield" />
              <div className="relative min-h-[150px]">
                <div className="absolute left-4 top-8 w-12 h-12 rounded-full border-2 border-emerald-400/80 bg-emerald-400/10 shadow-[0_0_20px_rgba(16,185,129,0.25)]" />
                <div className="absolute right-5 bottom-7 w-12 h-12 rounded-full border-2 border-rose-400/80 bg-rose-400/10 shadow-[0_0_20px_rgba(244,63,94,0.2)]" />
                <div className="absolute left-[70px] top-[58px] w-[105px] h-px bg-cyan-400/40 rotate-[24deg] origin-left" />
                <div className="absolute left-7 top-4 text-xs">🚀</div>
                <div className="absolute right-8 top-7 text-xs">🛡️</div>
                <div className="absolute left-24 bottom-5 text-xs">⬛⬛</div>
              </div>
              <div className="relative space-y-3 text-center">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Playable scenario</p>
                {onStartScenario && (
                  <button
                    onClick={launchLesson}
                    className="scifi-btn scifi-btn-secondary px-3 py-2 text-xs inline-flex items-center gap-2"
                  >
                    <Rocket className="h-4 w-4" />
                    Launch Lesson
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400 mb-3">Exactly what to do</p>
            <ol className="space-y-2">
              {meta.steps.map((step, index) => (
                <li key={`${level.id}-${index}`} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-cyan-500/40 bg-cyan-950/30 text-[11px] font-bold text-cyan-300">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid md:grid-cols-[1fr_1fr] gap-3">
            <div className="rounded border border-emerald-500/30 bg-emerald-950/10 p-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-300 mb-1">Lesson clear condition</p>
              <p className="text-sm text-slate-300 leading-relaxed">{level.success}</p>
            </div>
            <div className="rounded border border-amber-500/30 bg-amber-950/10 p-3">
              <div className="flex items-center gap-2 text-amber-300 mb-1">
                <Lightbulb className="h-4 w-4" />
                <p className="text-[10px] font-mono uppercase tracking-widest">Strategy notes</p>
              </div>
              <ul className="space-y-1 text-sm text-slate-300 leading-relaxed">
                {level.tips.map((tip, index) => <li key={index}>• {tip}</li>)}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 p-4 border-t border-slate-800 bg-slate-950/75">
        <div className="text-xs font-mono text-slate-500">
          Lesson {levelIndex + 1}/{tutorialLevels.length} • {completedCount}/{tutorialLevels.length} marked complete
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={previous} disabled={levelIndex === 0} className="scifi-btn px-3 py-2 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {onStartScenario && (
            <button
              onClick={launchLesson}
              className="scifi-btn scifi-btn-primary px-3 py-2 flex items-center gap-2"
            >
              <Rocket className="h-4 w-4" />
              Play Scenario
            </button>
          )}
          <button onClick={markComplete} className="scifi-btn px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {completed[level.id] ? 'Done Saved' : 'Mark Done'}
          </button>
          <button onClick={clearMarks} className="scifi-btn px-3 py-2 text-xs">
            Reset Marks
          </button>
          {levelIndex < tutorialLevels.length - 1 ? (
            <button onClick={next} className="scifi-btn scifi-btn-secondary px-3 py-2 flex items-center gap-2">
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={onExit} className="scifi-btn scifi-btn-primary px-3 py-2 flex items-center gap-2">
              Finish
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
