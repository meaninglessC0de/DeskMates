import type { TeamAskResponse } from '../../shared/index.ts';

/** W8 replaces this file with the Genie conversation client. */
export async function askGenie(_question: string, _conversationId?: string): Promise<TeamAskResponse> {
  throw new Error('Genie is not built yet (src/office/sync/genie.ts).');
}
