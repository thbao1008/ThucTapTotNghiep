export function createProgressOverview(speakingStats, challengeStats, additional = {}) {
  const completedChallenges = challengeStats.completed_challenges ?? 0;
  const activityCounts={speaking:speakingStats.completed_sessions,challenges:completedChallenges,
    story:additional.story?.practiced_sessions ?? 0,scenario_world:additional.scenario_world?.completed_sessions ?? 0};
  const totalPracticeCount = Object.values(activityCounts).reduce((total,value)=>total+value,0);

  return {
    overall_score: null,
    overall_score_rate: null,
    assessment_status: "not_assessed",
    total_practice_count: totalPracticeCount,
    speaking_practice_count: speakingStats.completed_sessions,
    challenge_count: completedChallenges,
    activity_counts: activityCounts,
    is_active: totalPracticeCount > 0
  };
}
