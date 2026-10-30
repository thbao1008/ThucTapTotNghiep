// Each occurrence has its own position, even when a sentence repeats a word.
// Keep these positions aligned with the words rendered by SpeakingRound.
export function normalizeSpokenWord(word) {
  return String(word ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const wordsIn = text => String(text ?? '').trim().split(/\s+/).filter(Boolean);

export function createSpokenWordProgress(prompt) {
  const targets = wordsIn(prompt).map(normalizeSpokenWord);
  const totalWords = targets.filter(Boolean).length;
  const archivedFinals = [];
  const currentFinals = new Map();
  let interim = [];

  function match(transcripts, initial = new Set()) {
    const matched = new Set(initial);
    for (const transcript of transcripts) {
      for (const spoken of wordsIn(transcript).map(normalizeSpokenWord).filter(Boolean)) {
        // A spoken occurrence can fill only the first remaining matching slot.
        const index = targets.findIndex((target, position) => target === spoken && !matched.has(position));
        if (index >= 0) matched.add(index);
      }
    }
    return matched;
  }

  function sortedFinals() {
    return [...currentFinals].sort(([a], [b]) => a - b).map(([, text]) => text);
  }

  function snapshot() {
    const finalized = [...archivedFinals, ...sortedFinals()];
    const finalIndices = match(finalized);
    const highlightedIndices = match(interim, finalIndices);
    return {
      highlightedIndices,
      finalIndices,
      totalWords,
      matchedWords: highlightedIndices.size,
      finalMatchedWords: finalIndices.size,
      // Interim hypotheses may still change. They can light a word but cannot
      // end the round until the recognizer has finalized the occurrence.
      complete: totalWords > 0 && finalIndices.size === totalWords,
      transcript: [...finalized, ...interim].filter(Boolean).join(' ').trim()
    };
  }

  return {
    // SpeechRecognition result indices restart at zero after every start().
    // Archive finalized results before that reset, never the interim hypothesis.
    beginRecognition() {
      archivedFinals.push(...sortedFinals());
      currentFinals.clear();
      interim = [];
      return snapshot();
    },

    // Pass the complete event.results list, not a concatenated transcript delta.
    // Repeated cumulative callbacks and interim -> final upgrades stay idempotent.
    update(results) {
      interim = [];
      for (let index = 0; index < (results?.length ?? 0); index++) {
        const result = results[index];
        const transcript = String(result?.[0]?.transcript ?? '').trim();
        if (result?.isFinal) {
          if (!currentFinals.has(index)) currentFinals.set(index, transcript);
        } else if (!currentFinals.has(index)) {
          interim.push(transcript);
        }
      }
      return snapshot();
    },

    snapshot
  };
}
