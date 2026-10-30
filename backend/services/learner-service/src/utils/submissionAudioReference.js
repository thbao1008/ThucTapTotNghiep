const referenceBase = "https://aesp-reference.invalid";
const submissionAudioPath = /^\/uploads\/(file-([0-9]+)-([0-9]+)\.webm)$/;
const maxGeneratedRandomSuffix = 1_000_000_000n;

function invalid(reason) {
  return { valid: false, reason };
}

export function validateSubmissionAudioReference(value) {
  if (typeof value !== "string") return invalid("invalid_type");
  if (value.length === 0) return invalid("empty_reference");
  if (value !== value.trim()) return invalid("whitespace");
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return invalid("invalid_character");
  if (value.includes("%")) return invalid("encoded_reference");
  if (value.includes("?") || value.includes("#")) return invalid("query_or_fragment");
  if (value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return invalid("absolute_url");
  }

  let parsed;
  try {
    parsed = new URL(value, referenceBase);
  } catch {
    return invalid("malformed_reference");
  }

  if (parsed.origin !== referenceBase || parsed.pathname !== value || parsed.search || parsed.hash) {
    return invalid("ambiguous_reference");
  }

  const match = submissionAudioPath.exec(value);
  if (!match) return invalid("unsupported_reference_format");
  if (match[1].length > 255) return invalid("filename_too_long");
  if (BigInt(match[3]) > maxGeneratedRandomSuffix) return invalid("random_suffix_out_of_range");

  return { valid: true, filename: match[1] };
}