import type { PollType, SelectedPoll } from './types';

const isString = (value: string | undefined): value is string => value !== undefined;

/** Stored in PollDetails and passed further so the send action can get the payload for ui_act. */
export type VoteDraft = {
  optionRef?: string;
  optionRefs?: string[];
  ratings?: Record<string, number>;
  ranking?: string[];
  text?: string;
};

/** True if the server supplied an existing ballot for this user for this poll. */
export function hasUserVoteRecord(poll: SelectedPoll): boolean {
  const uv = poll.user_votes;
  if (!uv) return false;
  if (uv.option_id !== undefined && uv.option_id !== null) return true;
  if (uv.option_ids && uv.option_ids.length > 0) return true;
  if (uv.ranking && uv.ranking.length > 0) return true;
  if (uv.ratings && Object.keys(uv.ratings).length > 0) return true;
  if (uv.text !== undefined && uv.text !== null && String(uv.text).trim())
    return true;
  return false;
}

/** User already answered and poll does not permit changing vote. */
export function isVoteSubmitBlocked(poll: SelectedPoll): boolean {
  return hasUserVoteRecord(poll) && !poll.allow_revoting;
}

export function makeInitialDraft(poll: SelectedPoll): VoteDraft {
  const uv = poll.user_votes;
  switch (poll.poll_type) {
    case 'OPTION': {
      if (uv?.option_id !== undefined && uv.option_id !== null) {
        const found = poll.options.find((o) => o.id === uv.option_id);
        if (found) return { optionRef: found.ref };
      }
      return {};
    }
    case 'MULTICHOICE': {
      if (uv?.option_ids?.length) {
        const refs = uv.option_ids
          .map((id) => poll.options.find((o) => o.id === id)?.ref)
          .filter(isString);
        return { optionRefs: refs };
      }
      return { optionRefs: [] };
    }
    case 'NUMVAL': {
      const ratings: Record<string, number> = {};
      for (const opt of poll.options) {
        const existing = uv?.ratings?.[opt.id];
        ratings[opt.ref] = existing ?? opt.min_val ?? 1;
      }
      return { ratings };
    }
    case 'TEXT':
      return { text: uv?.text ?? '' };
    default:
      return { optionRef: uv?.option_id ? poll.options.find((o) => o.id === uv.option_id)?.ref : undefined };
  }
}

/** Returns payload for ui_act if ready. */
export function buildVotePayload(
  type: PollType,
  draft: VoteDraft,
):
  | { ready: false; reason?: string }
  | { ready: true; payload: Record<string, unknown> } {
  switch (type) {
    case 'OPTION':
      if (!draft.optionRef) {
        return { ready: false, reason: 'Выберите один из вариантов' };
      }
      return { ready: true, payload: { option_ref: draft.optionRef } };
    case 'TEXT':
      if (!draft.text?.trim()) {
        return { ready: false, reason: 'Введите текст ответа' };
      }
      return { ready: true, payload: { replytext: draft.text } };
    case 'MULTICHOICE':
      if (!draft.optionRefs || draft.optionRefs.length === 0) {
        return { ready: false, reason: 'Выберите хотя бы один вариант' };
      }
      return {
        ready: true,
        payload: { option_refs: draft.optionRefs },
      };
    case 'NUMVAL':
      if (!draft.ratings || Object.keys(draft.ratings).length === 0) {
        return { ready: false, reason: 'Выберите хотя бы одну оценку' };
      }
      return { ready: true, payload: { ratings: draft.ratings } };
  }
}
