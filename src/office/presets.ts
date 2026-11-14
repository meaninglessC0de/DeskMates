import type { Env, Permissions, RolePreset } from '../shared/index.ts';

const BIG_STEPS: Permissions = { level: 'asks_big_steps', internet: true, commands: true, myScreen: false, teammates: true };

interface PresetRow {
  key: string;
  role: string;
  blurb: string;
  icon: string;
  workingStyle: string;
  starters: string[];
  level: Permissions['level'];
}

const ROWS: PresetRow[] = [
  { key: 'web_developer', role: 'Web developer', blurb: 'Builds and fixes software', icon: 'Code2', level: 'independent',
    workingStyle: 'Small steps, runs the tests before saying done, shows the staging link.',
    starters: ['Fix a bug', 'Build a page', 'Review my code'] },
  { key: 'marketer', role: 'Marketer', blurb: 'Plans campaigns and writes copy', icon: 'Megaphone', level: 'asks_big_steps',
    workingStyle: 'Offers three options, checks competitors, never posts without approval.',
    starters: ['Plan a campaign', 'Write a launch email', 'Research competitors'] },
  { key: 'researcher', role: 'Researcher', blurb: 'Finds, reads and weighs sources', icon: 'Search', level: 'asks_big_steps',
    workingStyle: 'Reads widely, keeps running notes, flags what is uncertain.',
    starters: ['Find the facts', 'Compare options', 'Summarise a paper'] },
  { key: 'designer', role: 'Designer', blurb: 'Sketches layouts and brand work', icon: 'PenTool', level: 'asks_big_steps',
    workingStyle: 'Sketches two directions, explains the why, asks before polishing.',
    starters: ['Sketch a layout', 'Improve this page', 'Make a logo'] },
  { key: 'data_analyst', role: 'Data analyst', blurb: 'Cleans data and builds charts', icon: 'BarChart3', level: 'asks_big_steps',
    workingStyle: 'Checks the data first, states assumptions, ends with one paragraph.',
    starters: ['Clean this data', 'Find the trend', 'Build a chart'] },
  { key: 'operations', role: 'Operations', blurb: 'Keeps work organised and moving', icon: 'ClipboardList', level: 'asks_big_steps',
    workingStyle: 'Keeps checklists, chases loose ends, reports once a day.',
    starters: ['Plan the week', 'Chase this up', 'Tidy my inbox'] },
  { key: 'sales', role: 'Sales', blurb: 'Finds leads and drafts outreach', icon: 'Handshake', level: 'asks_big_steps',
    workingStyle: 'Researches the lead first, drafts in your voice, asks before sending.',
    starters: ['Find leads', 'Draft outreach', 'Prepare for a call'] },
  { key: 'writer', role: 'Writer', blurb: 'Drafts, edits and documents', icon: 'FileText', level: 'asks_big_steps',
    workingStyle: 'Outlines first, edits twice, keeps your voice.',
    starters: ['Draft a post', 'Edit this', 'Write the docs'] },
];

export function buildPresets(env: Pick<Env, 'EMPLOYEE_MODEL'>): RolePreset[] {
  return ROWS.map((r) => ({
    key: r.key,
    role: r.role,
    blurb: r.blurb,
    icon: r.icon,
    workingStyle: r.workingStyle,
    starters: r.starters,
    defaultPermissions: { ...BIG_STEPS, level: r.level },
    defaultModel: env.EMPLOYEE_MODEL,
  }));
}

export const DEFAULT_PERMISSIONS: Permissions = { ...BIG_STEPS };
