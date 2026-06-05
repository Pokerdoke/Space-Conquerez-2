import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Flag, Rocket, Factory, Crosshair, Shield, RadioTower, Lightbulb, X, CheckCircle2 } from 'lucide-react';
import { audio } from '../services/audio';
import type { TutorialScenarioId } from '../services/tutorialScenarios';

interface TutorialProps {
  onExit: () => void;
  onStartScenario?: (scenarioId: TutorialScenarioId) => void;
}

type TutorialLevel = {
  id: TutorialScenarioId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  objective: string;
  scenario: string;
  exactSteps: string[];
  success: string;
  tips: string[];
};

const tutorialLevels: TutorialLevel[] = [
  {
    id: 'colonize',
    title: 'Level 1 — Colonizing a New Planet',
    subtitle: 'Turn an empty system into your empire territory.',
    icon: <Flag className="h-5 w-5" />,
    objective: 'Claim a neutral planet with a Colony Ship during the Action phase.',
    scenario: 'You start with a homeworld, a Colony Ship in orbit, and an empty connected planet named Vega Outpost.',
    exactSteps: [
      'Click your homeworld on the star map.',
      'Select your Colony Ship in the fleet list.',
      'During the Movement phase, click the glowing reachable empty planet to move there.',
      'Press Next Phase until the game reaches the Action phase.',
      'Select the planet with the Colony Ship, then click Colonize Planet.',
      'The planet becomes yours, starts as a Colony, and begins producing resources on your future turns.'
    ],
    success: 'You win this lesson when the neutral node changes to your player color and its development reads Colony.',
    tips: [
      'Colony Ships are not combat ships. Escort them if enemies are nearby.',
      'You do not auto-claim a planet by flying over it. You must use the colonize action.'
    ]
  },
  {
    id: 'movement',
    title: 'Level 2 — Ship Movement Basics',
    subtitle: 'Move fleets through linked systems without wasting movement.',
    icon: <Rocket className="h-5 w-5" />,
    objective: 'Move a Destroyer through safe connected systems and stop before hostile territory.',
    scenario: 'Your Destroyer has 6 movement points. Friendly and neutral systems are open, but enemy combat ships can block travel through a system.',
    exactSteps: [
      'Enter the Movement phase.',
      'Click the system that contains your ship.',
      'Click the ship you want to move. Valid destinations glow on the map.',
      'Click a glowing destination to move the ship there.',
      'Watch the movement cost in the action log. Longer paths use more movement points.',
      'Stop in a system if the next jump would put you past a hostile combat ship or FTL inhibitor.'
    ],
    success: 'You win this lesson when your Destroyer reaches the marked rally point with movement remaining.',
    tips: [
      'Fighters cannot move by themselves in this version.',
      'Carriers, Destroyers, and Battleships can act as movement blockers for enemies.'
    ]
  },
  {
    id: 'development',
    title: 'Level 3 — Development & Production',
    subtitle: 'Upgrade planets and build the economy that funds your fleets.',
    icon: <Factory className="h-5 w-5" />,
    objective: 'Upgrade a Colony into a City, then use that City to build ground troops.',
    scenario: 'You own a Colony with enough resources to develop it. The Build phase is active.',
    exactSteps: [
      'Start during the Build phase.',
      'Click one of your owned planets.',
      'Open the Build panel and click Upgrade Planet if you can afford the listed cost.',
      'Watch your resources drop immediately and the planet development update immediately.',
      'Once the planet is a City or Metropolis, click Build Ground Unit (3R).',
      'Cities can build 3 ground units per turn; Metropolises can build 6 per turn.'
    ],
    success: 'You win this lesson when the planet becomes a City and at least one friendly ground unit appears on the node.',
    tips: [
      'Higher development increases resource generation every turn.',
      'Build Shipyards on key planets so new ships can be produced near the front and damaged ships or troops can repair to full in one friendly turn.'
    ]
  },
  {
    id: 'space-combat',
    title: 'Level 4 — Space Combat',
    subtitle: 'Clear enemy ships before invading or moving safely through a system.',
    icon: <Crosshair className="h-5 w-5" />,
    objective: 'Destroy enemy combat ships in orbit using the combat panel.',
    scenario: 'A hostile Destroyer guards a planet. Your Destroyer and Battleship are in the same system during the Action phase.',
    exactSteps: [
      'Reach the Action phase with your ships in the same node as enemy ships.',
      'Select the contested node on the map.',
      'In the combat panel, select one of your attacking ships.',
      'Select one enemy defending ship.',
      'Click Attack. Both sides deal damage based on their damage range.',
      'Repeat until enemy combat ships are destroyed or your fleet is forced to stop.'
    ],
    success: 'You win this lesson when there are no enemy combat ships left in orbit.',
    tips: [
      'Battleships hit harder and have more HP than Destroyers.',
      'Carriers can fight, but their biggest value is bringing ground troops for invasions.'
    ]
  },
  {
    id: 'invasion',
    title: 'Level 5 — Planet Invasion',
    subtitle: 'Use carriers and ground troops to capture enemy or NPC planets.',
    icon: <Shield className="h-5 w-5" />,
    objective: 'Drop troops from a Carrier, win ground combat, and capture the planet.',
    scenario: 'Your Carrier is over an enemy/NPC planet with ground troops inside. Space combat has already cleared enemy combat ships from orbit.',
    exactSteps: [
      'Build Ground Units on a City or Metropolis during the Build phase.',
      'During the Movement phase on a friendly node, select a Carrier and click Load Troops.',
      'Move the Carrier to the enemy or NPC planet.',
      'In the Action phase, select that planet. If space is clear, click Invade Planet.',
      'All carried ground troops drop onto the planet together.',
      'If defenders exist, select one attacking troop and one defending troop, then click Attack.',
      'When all defender troops are destroyed, the planet automatically changes to the invading player. Surviving attackers stay as the garrison.',
      'If all attackers die first, the invasion fails and the planet stays with the defender.'
    ],
    success: 'You win this lesson when the planet border changes to your color after the last defender dies.',
    tips: [
      'You cannot invade while enemy combat ships are still in orbit.',
      'Bring more than one troop. Ground combat is simultaneous, so attackers can die too.'
    ]
  },
  {
    id: 'advanced',
    title: 'Level 6 — Advanced Strategy',
    subtitle: 'Use FTL inhibitors, shipyards, carriers, and timing to control the map.',
    icon: <RadioTower className="h-5 w-5" />,
    objective: 'Build defensive chokepoints and plan a safe invasion route.',
    scenario: 'Two empires are connected by a narrow chain of systems. A fortified system can slow enemy movement and protect your core worlds.',
    exactSteps: [
      'Identify chokepoints: systems with only one or two links between empires.',
      'Place combat ships there. Destroyers, Battleships, and Carriers stop enemy ships from moving through the system.',
      'Build an FTL Inhibitor structure on important planets for a permanent blocker while you own the planet.',
      'Remember: enemies may enter an inhibited system, but cannot pass through it until the planet is captured.',
      'Build Shipyards near the front so reinforcements do not travel as far. Damaged ships and troops repair to full in one turn at a Shipyard, or recover over about 2–3 turns in friendly territory without one.',
      'Use carriers to carry up to 3 ground troops, clear orbit first, then invade during the Action phase.'
    ],
    success: 'You win this lesson when your fleet holds the chokepoint and your Carrier captures the target planet behind it.',
    tips: [
      'A blocker only helps if you can defend the system. Unsupported inhibitors eventually fall.',
      'Do not spend everything on ships. Development pays for the next wave.'
    ]
  }
];

export const Tutorial: React.FC<TutorialProps> = ({ onExit, onStartScenario }) => {
  const [levelIndex, setLevelIndex] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const level = tutorialLevels[levelIndex];

  const completedCount = useMemo(() => Object.values(completed).filter(Boolean).length, [completed]);

  const goToLevel = (index: number) => {
    audio.playBeep(620, 0.05);
    setLevelIndex(index);
  };

  const markComplete = () => {
    audio.playBuild();
    setCompleted(prev => ({ ...prev, [level.id]: true }));
  };

  const next = () => {
    audio.playBeep(700, 0.05);
    setLevelIndex(i => Math.min(tutorialLevels.length - 1, i + 1));
  };

  const previous = () => {
    audio.playBeep(500, 0.05);
    setLevelIndex(i => Math.max(0, i - 1));
  };

  return (
    <div className="glass-panel rounded-lg border border-slate-800/80 overflow-hidden animate-fadeIn max-h-[78vh] flex flex-col">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-800 bg-slate-950/70">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-400">Training Academy</p>
          <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-100">How to Play</h2>
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

      <div className="grid md:grid-cols-[240px_1fr] min-h-0 flex-1">
        <aside className="border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/50 p-3 overflow-x-auto md:overflow-y-auto">
          <div className="flex md:flex-col gap-2 min-w-max md:min-w-0">
            {tutorialLevels.map((item, index) => {
              const active = index === levelIndex;
              const done = completed[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => goToLevel(index)}
                  className={`text-left rounded border px-3 py-3 min-w-[210px] md:min-w-0 transition-all ${
                    active
                      ? 'border-cyan-400/70 bg-cyan-950/30 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.15)]'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={active ? 'text-cyan-300' : 'text-slate-500'}>{item.icon}</span>
                    <span className="text-xs font-bold uppercase tracking-wider">{item.title.replace('Level ', 'L')}</span>
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
                  <h3 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-slate-100">{level.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{level.subtitle}</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded border border-indigo-500/30 bg-indigo-950/20 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-indigo-300 mb-1">Objective</p>
                  <p className="text-sm text-slate-200 leading-relaxed">{level.objective}</p>
                </div>
                <div className="rounded border border-slate-700/70 bg-slate-950/50 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Scenario</p>
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
                    onClick={() => { audio.playVictory(); onStartScenario(level.id); }}
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
              {level.exactSteps.map((step, index) => (
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

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-t border-slate-800 bg-slate-950/75">
        <div className="text-xs font-mono text-slate-500">
          Lesson {levelIndex + 1}/{tutorialLevels.length} • {completedCount}/{tutorialLevels.length} marked complete
        </div>
        <div className="flex gap-2">
          <button onClick={previous} disabled={levelIndex === 0} className="scifi-btn px-3 py-2 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {onStartScenario && (
            <button
              onClick={() => { audio.playVictory(); onStartScenario(level.id); }}
              className="scifi-btn scifi-btn-primary px-3 py-2 flex items-center gap-2"
            >
              <Rocket className="h-4 w-4" />
              Play Scenario
            </button>
          )}
          <button onClick={markComplete} className="scifi-btn px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Mark Done
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
