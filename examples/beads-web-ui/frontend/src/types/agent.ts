/**
 * Agent-related types.
 */

/**
 * Agent state values.
 * Maps to Go types.AgentState.
 */
export type AgentState =
  | 'idle'
  | 'spawning'
  | 'running'
  | 'working'
  | 'stuck'
  | 'done'
  | 'stopped'
  | 'dead'
  | '';

/**
 * Agent state constants.
 */
export const StateIdle: AgentState = 'idle';
export const StateSpawning: AgentState = 'spawning';
export const StateRunning: AgentState = 'running';
export const StateWorking: AgentState = 'working';
export const StateStuck: AgentState = 'stuck';
export const StateDone: AgentState = 'done';
export const StateStopped: AgentState = 'stopped';
export const StateDead: AgentState = 'dead';

/**
 * Molecule type for swarm coordination.
 * Maps to Go types.MolType.
 */
export type MolType = 'swarm' | 'patrol' | 'work' | '';

/**
 * MolType constants.
 */
export const MolTypeSwarm: MolType = 'swarm';
export const MolTypePatrol: MolType = 'patrol';
export const MolTypeWork: MolType = 'work';

/**
 * Work type for assignment models.
 * Maps to Go types.WorkType.
 */
export type WorkType = 'mutex' | 'open_competition' | '';

/**
 * WorkType constants.
 */
export const WorkTypeMutex: WorkType = 'mutex';
export const WorkTypeOpenCompetition: WorkType = 'open_competition';
