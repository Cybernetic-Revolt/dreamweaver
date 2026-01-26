/**
 * Game Content: Locations and Quest
 *
 * Day 5: minimal content for deterministic demo.
 * 3 locations, 1 simple questline.
 */

export interface Location {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>;  // direction -> locationId
  items: string[];
  npcs: string[];
  lookDetails: string[];  // Additional details revealed on LOOK
}

export interface QuestStep {
  id: number;
  description: string;
  trigger: string;  // What advances to next step
  narration: string;  // What to say when step advances
}

// ============================================================================
// Locations
// ============================================================================

export const LOCATIONS: Record<string, Location> = {
  forest_entrance: {
    id: 'forest_entrance',
    name: 'Forest Entrance',
    description: 'You stand at the edge of a dark forest. Twisted trees loom ahead.',
    exits: {
      north: 'forest_clearing',
      east: 'old_bridge',
    },
    items: ['stick'],
    npcs: [],
    lookDetails: [
      'Moss covers the ancient stones marking the path.',
      'You hear distant birdsong from deeper in the forest.',
    ],
  },

  forest_clearing: {
    id: 'forest_clearing',
    name: 'Forest Clearing',
    description: 'Sunlight breaks through the canopy in this peaceful clearing.',
    exits: {
      south: 'forest_entrance',
      north: 'ancient_ruins',
    },
    items: ['mushroom', 'flower'],
    npcs: ['old_hermit'],
    lookDetails: [
      'An old hermit sits on a log, watching you curiously.',
      'Wildflowers dot the grass around you.',
    ],
  },

  ancient_ruins: {
    id: 'ancient_ruins',
    name: 'Ancient Ruins',
    description: 'Crumbling stone pillars surround a weathered pedestal.',
    exits: {
      south: 'forest_clearing',
    },
    items: ['ancient_artifact'],
    npcs: [],
    lookDetails: [
      'Strange symbols are carved into the pedestal.',
      'The artifact glows faintly with an inner light.',
    ],
  },

  old_bridge: {
    id: 'old_bridge',
    name: 'Old Bridge',
    description: 'A rickety wooden bridge spans a rushing stream.',
    exits: {
      west: 'forest_entrance',
    },
    items: ['rope'],
    npcs: [],
    lookDetails: [
      'The bridge creaks dangerously underfoot.',
      'Clear water rushes below, hiding smooth stones.',
    ],
  },
};

// ============================================================================
// Quest: Find the Artifact
// ============================================================================

export const QUEST_STEPS: QuestStep[] = [
  {
    id: 0,
    description: 'Start your journey',
    trigger: 'start',
    narration: 'Your quest begins. Find the ancient artifact hidden in these woods.',
  },
  {
    id: 1,
    description: 'Find the hermit',
    trigger: 'talk_old_hermit',
    narration: 'The hermit nods wisely. He points north, toward the ruins.',
  },
  {
    id: 2,
    description: 'Reach the ruins',
    trigger: 'enter_ancient_ruins',
    narration: 'The ruins loom before you. The artifact must be here.',
  },
  {
    id: 3,
    description: 'Take the artifact',
    trigger: 'take_ancient_artifact',
    narration: 'You have found the ancient artifact! Your quest is complete.',
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function getLocation(locationId: string): Location | undefined {
  return LOCATIONS[locationId];
}

export function getQuestStep(step: number): QuestStep | undefined {
  return QUEST_STEPS[step];
}

export function getExitDescription(location: Location): string {
  const exits = Object.keys(location.exits);
  if (exits.length === 0) return 'There are no obvious exits.';
  if (exits.length === 1) return `You can go ${exits[0]}.`;
  return `You can go ${exits.slice(0, -1).join(', ')} or ${exits[exits.length - 1]}.`;
}

export function getItemsDescription(location: Location): string {
  if (location.items.length === 0) return '';
  if (location.items.length === 1) return `You see a ${location.items[0]} here.`;
  return `You see: ${location.items.join(', ')}.`;
}

export function getNpcsDescription(location: Location): string {
  if (location.npcs.length === 0) return '';
  const npcNames = location.npcs.map(npc => npc.replace('_', ' '));
  if (npcNames.length === 1) return `${npcNames[0]} is here.`;
  return `${npcNames.join(' and ')} are here.`;
}
