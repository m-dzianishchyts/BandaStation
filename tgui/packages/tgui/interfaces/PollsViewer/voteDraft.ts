import type { PollType, SelectedPoll } from './types';

/**
 * Черновик голоса пользователя. Хранится в состоянии PollDetails и передаётся вниз,
 * чтобы footer-кнопка Отправить могла собрать payload для ui_act.
 */
export type VoteDraft = {
  optionRef?: string;
  optionRefs?: string[];
  ratings?: Record<string, number>;
  ranking?: string[];
  text?: string;
};

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
          .filter(Boolean) as string[];
        return { optionRefs: refs };
      }
      return { optionRefs: [] };
    }
    case 'IRV': {
      if (uv?.ranking?.length) {
        const refs = uv.ranking
          .map((id) => poll.options.find((o) => o.id === id)?.ref)
          .filter(Boolean) as string[];
        return { ranking: refs };
      }
      return { ranking: poll.options.map((o) => o.ref) };
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
  }
  return {};
}

/**
 * Готов ли черновик к отправке. Также возвращает payload для ui_act, если готов.
 */
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
      if (!draft.text || !draft.text.trim()) {
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
    case 'IRV':
      if (!draft.ranking || draft.ranking.length === 0) {
        return { ready: false, reason: 'Нужно ранжировать варианты' };
      }
      return { ready: true, payload: { ranking: draft.ranking } };
    case 'NUMVAL':
      if (!draft.ratings || Object.keys(draft.ratings).length === 0) {
        return { ready: false, reason: 'Оцените варианты' };
      }
      return { ready: true, payload: { ratings: draft.ratings } };
  }
  return { ready: false };
}
