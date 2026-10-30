// Keep learner/history text as conversation data rather than interpolating it
// into the system instruction. Stored user.ai_response duplicates the AI row.
export function storyConversationMessages(systemPrompt, history, userMessage) {
  return [{ role: 'system', content: systemPrompt },
    ...history.slice(-10).filter(row => ['ai', 'user'].includes(row.message_type)
      && typeof row.text_content === 'string' && row.text_content.trim()).map(row => ({
      role: row.message_type === 'ai' ? 'assistant' : 'user', content: row.text_content
    })),
    { role: 'user', content: userMessage }];
}

// Short visible answers still need enough completion budget for the configured
// model. Do not retry truncated answers or silently accept incomplete output.
export const STORY_OUTPUT_TOKENS = 768;
