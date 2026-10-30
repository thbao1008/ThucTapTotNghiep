export function normalizeSpeakingWord(word) {
  return String(word ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function speakingWordTargets(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean)
    .map((word, index) => ({ word: normalizeSpeakingWord(word), index }))
    .filter(target => target.word);
}

export function matchSpeakingWordOccurrences(expectedText, transcript) {
  const targets = speakingWordTargets(expectedText), matchedIndices = new Set();
  for (const spoken of speakingWordTargets(transcript)) {
    const target = targets.find(candidate => candidate.word === spoken.word && !matchedIndices.has(candidate.index));
    if (target) matchedIndices.add(target.index);
  }
  return describeSpeakingMatches(targets, matchedIndices);
}

export function matchSpeakingHighlightIndices(expectedText, indices) {
  const targets = speakingWordTargets(expectedText), matchedIndices = new Set();
  if (Array.isArray(indices)) {
    const validPositions = new Set(targets.map(target => target.index));
    for (const value of indices) {
      const position = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN;
      if (Number.isSafeInteger(position) && validPositions.has(position)) matchedIndices.add(position);
    }
  }
  return describeSpeakingMatches(targets, matchedIndices);
}

function describeSpeakingMatches(targets, matchedIndices) {
  return {
    expectedWords: targets.map(target => target.word),
    matchedIndices: [...matchedIndices].sort((a, b) => a - b),
    matchedWords: targets.filter(target => matchedIndices.has(target.index)).map(target => target.word),
    missingWords: targets.filter(target => !matchedIndices.has(target.index)).map(target => target.word)
  };
}
