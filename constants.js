/*
 * constants.js
 * Stores all static game data, character definitions, skill icons, and controls.
 *
 * NEW: All skills now have "tags" to power the Utility-Based AI.
 */

import * as THREE from 'three';

export const MODES = {
  LOCAL_CLASSIC:  { key:'LOCAL_CLASSIC',  rift:false },
  LOCAL_RIFT:     { key:'LOCAL_RIFT',     rift:true  },
  ONLINE_CLASSIC: { key:'ONLINE_CLASSIC', rift:false },
  ONLINE_RIFT:    { key:'ONLINE_RIFT',    rift:true  }
};

export const controlsP1P2 = {
  p1: { forward: 'w', backward: 's', left: 'a', right: 'd', basicAttack: ' ', skill1: 'q', skill2: 'e', skill3: 'r', skill4: 'f' },
  p2: { forward: 'i', backward: 'k', left: 'j', right: 'l', basicAttack: 'enter', skill1: 'u', skill2: 'o', skill3: 'p', skill4: 'h' }
};

export const CHARACTERS = {
  ECHO_PRIME: {
    name: "Echo Prime", hp: 100, speed: 8, color: 0x00ffff, attackType: 'RANGED',
    passive: { name: "Resonance", desc: "Every 3rd basic attack deals 15 bonus damage and restores 10 energy." },
    skills: {
      s1: {name:"Power Shot", cost: 25, cd: 4, tags: ['damage', 'projectile', 'combo']},
      s2: {name:"Phase Shift", cost: 30, cd: 5, tags: ['mobility', 'escape']},
      s3: {name:"Static Field", cost: 50, cd: 12, tags: ['damage', 'aoe', 'zone']},
      s4: {name:"Overcharge", cost: 80, cd: 40, tags: ['buff', 'damage', 'utility', 'ultimate']}
    }
  },
  AEGIS: {
    name: "Aegis", hp: 140, speed: 6, color: 0xffa500, attackType: 'MELEE',
    passive: { name: "Fortress", desc: "Standing still for 2s grants a 20HP shield (decays after moving)." },
    skills: {
      s1: {name:"Aegis Charge", cost: 20, cd: 5, tags: ['damage', 'mobility', 'engage', 'cc']},
      s2: {name:"Energy Shield", cost: 40, cd: 8, tags: ['defensive', 'shield']},
      s3: {name:"Overload", cost: 60, cd: 12, tags: ['damage', 'aoe', 'combo']},
      s4: {name:"Righteous Stand", cost: 70, cd: 35, tags: ['defensive', 'shield', 'cc', 'ultimate']}
    }
  },
  SPECTRE: {
    name: "Spectre", hp: 85, speed: 10, color: 0x9400d3, attackType: 'MELEE',
    passive: { name: "Shadowstrike", desc: "Basic attacks on an enemy from behind deal 15% bonus damage." },
    skills: {
      s1: {name:"Venom Blade", cost: 15, cd: 4, tags: ['damage', 'buff', 'dot']},
      s2: {name:"Blink", cost: 25, cd: 5, tags: ['mobility', 'engage', 'escape']},
      s3: {name:"Cloak", cost: 60, cd: 12, tags: ['defensive', 'escape', 'utility']},
      s4: {name:"Death Mark", cost: 90, cd: 50, tags: ['debuff', 'dot', 'execute', 'ultimate']}
    }
  },
  JAVELIN: {
    name: "Javelin", hp: 90, speed: 7, color: 0x32cd32, attackType: 'RANGED',
    passive: { name: "Sharpshooter", desc: "Damage increases with distance, up to +20%." },
    skills: {
      s1: {name:"Targeting Array", cost: 30, cd: 10, tags: ['buff', 'damage']},
      s2: {name:"Slowing Mine", cost: 40, cd: 10, tags: ['utility', 'zone', 'cc']},
      s3: {name:"Laser Core", cost: 80, cd: 18, tags: ['damage', 'channel', 'combo', 'projectile']},
      s4: {name:"Orbital Strike", cost: 100, cd: 60, tags: ['damage', 'aoe', 'combo', 'execute', 'ultimate']}
    }
  },
  TEMPEST: {
    name: "Tempest", hp: 100, speed: 8, color: 0x1e90ff, attackType: 'RANGED',
    passive: { name: "Static Charge", desc: "Skills apply Static. At 3 stacks, the next skill stuns for 0.5s." },
    skills: {
      s1: {name:"Static Orb", cost: 25, cd: 6, tags: ['damage', 'projectile', 'cc']},
      s2: {name:"Ball Lightning", cost: 50, cd: 12, tags: ['damage', 'projectile', 'combo']},
      s3: {name:"Cyclone", cost: 70, cd: 15, tags: ['utility', 'cc', 'aoe']},
      s4: {name:"Eye of the Storm", cost: 90, cd: 45, tags: ['damage', 'aoe', 'cc', 'combo', 'ultimate']}
    }
  },
  GLITCH: {
    name: "Glitch", hp: 100, speed: 8, color: 0xf0e68c, attackType: 'RANGED',
    passive: { name: "Firewall", desc: "Once every 20s, block one enemy skill." },
    skills: {
      s1: {name:"Corruption", cost: 30, cd: 8, tags: ['debuff', 'dot', 'projectile']},
      s2: {name:"Rewind", cost: 40, cd: 10, tags: ['defensive', 'heal', 'escape', 'utility']},
      s3: {name:"Swap", cost: 60, cd: 20, tags: ['utility', 'mobility', 'engage']},
      s4: {name:"System Crash", cost: 75, cd: 40, tags: ['damage', 'debuff', 'aoe', 'interrupt', 'ultimate']}
    }
  },
  COLOSSUS: {
    name: "Colossus", hp: 150, speed: 6.5, color: 0xdc143c, attackType: 'MELEE',
    passive: { name: "Juggernaut", desc: "Have +10% HP, but 20% slower energy regen." },
    skills: {
      s1: {name:"Decimate", cost: 20, cd: 3, tags: ['damage', 'aoe']},
      s2: {name:"Tectonic Slam", cost: 30, cd: 7, tags: ['damage', 'aoe', 'cc']},
      s3: {name:"Unstoppable Force", cost: 60, cd: 16, tags: ['buff', 'engage', 'utility']},
      s4: {name:"Pulverize", cost: 100, cd: 50, tags: ['damage', 'aoe', 'cc', 'combo', 'engage', 'ultimate']}
    }
  },
  CHRONOMANCER: {
    name: "Chronomancer", hp: 95, speed: 8, color: 0x40e0d0, attackType: 'RANGED',
    passive: { name: "Time Flux", desc: "Gain 5% cooldown reduction on all skills." },
    skills: {
      s1: {name:"Temporal Anomaly", cost: 35, cd: 9, tags: ['damage', 'projectile', 'cc']},
      s2: {name:"Stasis Field", cost: 40, cd: 12, tags: ['utility', 'zone', 'cc']},
      s3: {name:"Chrono Prison", cost: 75, cd: 18, tags: ['cc', 'projectile', 'combo']},
      s4: {name:"Time Stop", cost: 100, cd: 60, tags: ['utility', 'cc', 'aoe', 'defensive', 'ultimate']}
    }
  },
  ORACLE: {
    name: "Oracle", hp: 110, speed: 7, color: 0xffffff, attackType: 'RANGED',
    passive: { name: "Foresight", desc: "You and allies near your Turret gain 10% move speed." },
    skills: {
      s1: {name:"Empower", cost: 25, cd: 12, tags: ['buff', 'utility', 'damage']},
      s2: {name:"Sentry Turret", cost: 40, cd: 10, tags: ['utility', 'zone', 'damage']},
      s3: {name:"Bastion Protocol", cost: 60, cd: 18, tags: ['defensive', 'shield']},
      s4: {name:"Salvation", cost: 80, cd: 45, tags: ['defensive', 'heal', 'ultimate']}
    }
  },
  ZEPHYR: {
    name: "Zephyr", hp: 90, speed: 11.5, color: 0x90ee90, attackType: 'RANGED',
    passive: { name: "Swiftness", desc: "Gain 5% bonus movement speed." },
    skills: {
      s1: {name:"Tailwind", cost: 20, cd: 8, tags: ['mobility', 'escape', 'buff']},
      s2: {name:"Wind Wall", cost: 40, cd: 10, tags: ['defensive', 'zone', 'utility']},
      s3: {name:"Phase Shift", cost: 30, cd: 6, tags: ['mobility', 'escape']},
      s4: {name:"Gale Force", cost: 80, cd: 40, tags: ['damage', 'projectile', 'cc', 'ultimate']}
    }
  },
  NULL: {
    name: "Null", hp: 100, speed: 8.5, color: 0xa020f0, attackType: 'RANGED',
    passive: { name: "Mana Burn", desc: "Your basic attacks burn 5 energy from the target." },
    skills: {
      s1: {name:"Feedback Loop", cost: 30, cd: 7, tags: ['debuff', 'dot', 'projectile']},
      s2: {name:"Silence", cost: 40, cd: 12, tags: ['debuff', 'cc', 'interrupt', 'projectile']},
      s3: {name:"Spell Shield", cost: 30, cd: 15, tags: ['defensive', 'shield']},
      s4: {name:"Energy Void", cost: 60, cd: 30, tags: ['debuff', 'damage', 'shield_break', 'ultimate']}
    }
  },
  VORTEX: {
    name: "Vortex", hp: 120, speed: 8.5, color: 0x6a0dad, attackType: 'RANGED',
    passive: { name: "Event Horizon", desc: "Skills apply Gravity Mark (stacking) for 4s. At 3 stacks, marks are consumed to Stun target for 1.5s & pull them 5 units. Basic attacks also apply Gravity Marks." },
    skills: {
      s1: {name:"Crushing Singularity", cost: 25, cd: 7, tags: ['damage', 'projectile', 'cc', 'zone']},
      s2: {name:"Graviton Pulse", cost: 30, cd: 8, tags: ['damage', 'aoe', 'cc']},
      s3: {name:"Implosion", cost: 45, cd: 12, tags: ['damage', 'debuff', 'combo']},
      s4: {name:"Black Hole", cost: 70, cd: 40, tags: ['cc', 'aoe', 'zone', 'combo', 'ultimate']}
    }
  },
  MIRAGE: { // (Emperor)
    name: "Emperor", hp: 80, speed: 9, color: 0xffd700, attackType: 'RANGED',
    passive: { name: "Imperial Will", desc: "Soldier attacks grant 20% bonus attack speed for 3s, stacking 3x." },
    skills: {
      s1: {name:"Arise!", cost: 30, cd: 5, tags: ['utility', 'zone', 'damage']},
      s2: {name:"Conquering Sands", cost: 40, cd: 8, tags: ['damage', 'mobility', 'cc']},
      s3: {name:"Shifting Sands", cost: 25, cd: 10, tags: ['mobility', 'escape', 'engage']},
      s4: {name:"Emperor's Divide", cost: 100, cd: 60, tags: ['utility', 'zone', 'cc', 'defensive', 'ultimate']}
    }
  },
  FORGE: {
    name: "Forge", hp: 120, speed: 6.5, color: 0xcd7f32, attackType: 'MELEE',
    passive: { name: "Scrap Collector", desc: "Destroyed constructs drop scrap, restoring 20 energy." },
    skills: {
      s1: {name:"Build Turret", cost: 40, cd: 10, tags: ['utility', 'zone', 'damage']},
      s2: {name:"Barrier Wall", cost: 30, cd: 12, tags: ['defensive', 'zone', 'utility']},
      s3: {name:"Siege Mode", cost: 60, cd: 16, tags: ['buff', 'damage', 'zone']},
      s4: {name:"Anvil Turret", cost: 100, cd: 60, tags: ['damage', 'zone', 'utility', 'ultimate']}
    }
  },
  CATALYST: {
    name: "Catalyst", hp: 90, speed: 8, color: 0x00ff7f, attackType: 'RANGED',
    passive: { name: "Corrosion", desc: "Caustic Blast's slow duration is increased by 0.5s per Venom stack on the target." },
    skills: {
      s1: {name:"Caustic Blast", cost: 20, cd: 5, tags: ['damage', 'projectile', 'cc', 'dot']},
      s2: {name:"Adrenal Haze", cost: 45, cd: 14, tags: ['buff', 'debuff', 'aoe', 'cc']},
      s3: {name:"Venom Blade", cost: 20, cd: 6, tags: ['buff', 'dot']},
      s4: {name:"Plague Cloud", cost: 75, cd: 45, tags: ['aoe', 'zone', 'dot', 'debuff', 'ultimate']}
    }
  },
  RONIN: { // REBALANCED
    name: "Ronin", hp: 95, speed: 10.5, color: 0xff4500, attackType: 'MELEE', // Buffed HP from 85 to 95
    passive: { name: "Way of the Blade", desc: "After using a skill, your next basic attack has bonus range & damage." },
    skills: {
      s1: {name:"Iaijutsu Dash", cost: 20, cd: 4, tags: ['damage', 'mobility', 'engage']},
      s2: {name:"Parry Stance", cost: 30, cd: 9, tags: ['defensive', 'cc', 'interrupt']},
      s3: {name:"Blade Fury", cost: 65, cd: 15, tags: ['damage', 'aoe', 'combo']},
      s4: {name:"Shadow Strike", cost: 90, cd: 50, tags: ['damage', 'engage', 'execute', 'ultimate']}
    }
  }
};

export const SKILL_ICONS = {
    basicAttack: 'ATK',
    // S1
    "Power Shot": 'PS', "Aegis Charge": 'AC', "Venom Blade": 'VB', "Targeting Array": 'TA', "Static Orb": 'SO',
    "Corruption": 'CR', "Decimate": 'DC', "Temporal Anomaly": 'TA', "Empower": 'EM', "Tailwind": 'TW',
    "Feedback Loop": 'FL', "Crushing Singularity": 'CS', "Doppelganger": 'DG', "Build Turret": 'BT', "Caustic Blast": 'CB',
    "Iaijutsu Dash": 'ID', "Arise!": 'SND',
    // S2
    "Phase Shift": 'SH', "Energy Shield": 'ES', "Blink": 'BL', "Slowing Mine": 'SM', "Ball Lightning": 'BL',
    "Rewind": 'RW', "Tectonic Slam": 'TS', "Stasis Field": 'SF', "Sentry Turret": 'ST', "Wind Wall": 'WW',
    "Silence": 'SL', "Graviton Pulse": 'GP', "Shimmer": 'SH', "Barrier Wall": 'BW', "Adrenal Haze": 'AH',
    "Parry Stance": 'PS', "Conquering Sands": 'DSH',
    // S3
    "Static Field": 'SF', "Overload": 'OV', "Cloak": 'CL', "Laser Core": 'LC', "Cyclone": 'CY',
    "Swap": 'SW', "Unstoppable Force": 'UF', "Chrono Prison": 'CP', "Bastion Protocol": 'BP',
    "Implosion": 'IM', "Spell Shield": 'SS', "Siege Mode": 'SM', "Blade Fury": 'BF', "Shifting Sands": 'TP',
    // S4 (Ultimates)
    "Overcharge": 'OC', "Righteous Stand": 'RS', "Death Mark": 'DM', "Orbital Strike": 'OS', "Eye of the Storm": 'ES',
    "System Crash": 'SC', "Pulverize": 'PV', "Time Stop": 'TS', "Salvation": 'SV', "Gale Force": 'GF',
    "Energy Void": 'EV', "Black Hole": 'BH', "Army of Shadows": 'AS', "Emperor's Divide": 'WAL',
    "Anvil Turret": 'AT', "Plague Cloud": 'PC', "Shadow Strike": 'SS'
};