import jwt from "jsonwebtoken";

export function createFileReadAuthorizer({ pool, jwtSecret } = {}) {
  if (!pool || typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new TypeError("File read authorization requires database and JWT dependencies");
  }

  return async function authorizeFileRead({ filename, authorization }) {
    let user = null;
    if (authorization !== undefined) {
      const match = typeof authorization === "string" && authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) return { allowed: false, status: 403 };

      let decoded;
      try {
        decoded = jwt.verify(match[1], jwtSecret, { algorithms: ["HS256"] });
      } catch {
        return { allowed: false, status: 403 };
      }
      if (!Number.isSafeInteger(decoded?.id) || decoded.id <= 0) {
        return { allowed: false, status: 403 };
      }

      const session = await pool.query(`
        SELECT u.id, lower(u.role) AS role
        FROM public.users u
        JOIN public.user_sessions s ON s.user_id = u.id
        WHERE s.token = $1
          AND s.user_id = $2
          AND s.is_active = TRUE
          AND s.expires_at > NOW()
          AND u.status = 'active'
      `, [match[1], decoded.id]);
      if (!session.rows[0]) return { allowed: false, status: 403 };
      user = session.rows[0];
    }

    const result = await pool.query(`
      WITH request_context AS (
        SELECT $1::text AS filename, $2::integer AS user_id, $3::text AS user_role
      )
      SELECT
        EXISTS (
          SELECT 1 FROM public.users x, request_context q
          WHERE regexp_replace(split_part(x.avatar_url, '?', 1), '^.*/', '') = q.filename
        ) AS public_avatar,
        EXISTS (
          SELECT 1 FROM public.community_posts p, request_context q
          WHERE regexp_replace(split_part(p.audio_url, '?', 1), '^.*/', '') = q.filename
            AND p.status = 'approved' AND p.is_deleted = FALSE
        ) OR EXISTS (
          SELECT 1 FROM public.community_posts p, request_context q
          WHERE regexp_replace(split_part(p.image_url, '?', 1), '^.*/', '') = q.filename
            AND p.status = 'approved' AND p.is_deleted = FALSE
        ) AS public_post_media,
        EXISTS (
          SELECT 1 FROM public.post_comments c
          JOIN public.community_posts p ON p.id = c.post_id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(c.audio_url, '?', 1), '^.*/', '') = q.filename
            AND p.status = 'approved' AND p.is_deleted = FALSE AND c.is_deleted = FALSE
        ) AS public_comment_audio,
        EXISTS (
          SELECT 1 FROM public.community_posts p, request_context q
          WHERE (
            regexp_replace(split_part(p.audio_url, '?', 1), '^.*/', '') = q.filename
            OR regexp_replace(split_part(p.image_url, '?', 1), '^.*/', '') = q.filename
          )
          AND (
            (p.status = 'approved' AND p.is_deleted = FALSE)
            OR (q.user_id IS NOT NULL AND p.author_id = q.user_id)
            OR q.user_role = 'admin'
          )
        ) AS community_post_access,
        EXISTS (
          SELECT 1 FROM public.post_comments c
          JOIN public.community_posts p ON p.id = c.post_id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(c.audio_url, '?', 1), '^.*/', '') = q.filename
            AND (
              (p.status = 'approved' AND p.is_deleted = FALSE AND c.is_deleted = FALSE)
              OR (q.user_id IS NOT NULL AND c.author_id = q.user_id)
              OR q.user_role = 'admin'
            )
        ) AS community_comment_access,
        EXISTS (
          SELECT 1 FROM public.submissions s
          JOIN public.learners l ON l.id = s.learner_id
          LEFT JOIN public.mentors m ON m.id = l.mentor_id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(s.audio_url, '?', 1), '^.*/', '') = q.filename
            AND (
              (q.user_role = 'learner' AND l.user_id = q.user_id)
              OR (q.user_role = 'mentor' AND m.user_id = q.user_id)
            )
        ) AS submission_access,
        EXISTS (
          SELECT 1 FROM public.speaking_practice_rounds r
          JOIN public.speaking_practice_sessions s ON s.id = r.session_id
          JOIN public.learners l ON l.id = s.learner_id
          LEFT JOIN public.mentors m ON m.id = l.mentor_id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(r.audio_url, '?', 1), '^.*/', '') = q.filename
            AND (
              (q.user_role = 'learner' AND l.user_id = q.user_id)
              OR (q.user_role = 'mentor' AND m.user_id = q.user_id)
            )
        ) AS speaking_round_access,
        EXISTS (
          SELECT 1 FROM public.feedbacks f
          JOIN public.learners l ON l.id = f.learner_id
          LEFT JOIN public.mentors m ON m.id = l.mentor_id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(f.audio_url, '?', 1), '^.*/', '') = q.filename
            AND (
              (q.user_role = 'learner' AND l.user_id = q.user_id)
              OR               (q.user_role = 'mentor' AND m.user_id = q.user_id)
            )
        ) AS feedback_access,
        EXISTS (
          SELECT 1 FROM public.scenario_conversations c
          JOIN public.scenario_sessions s ON s.id = c.session_id
          JOIN public.learners l ON l.id = s.learner_id
          LEFT JOIN public.mentors m ON m.id = l.mentor_id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(c.audio_url, '?', 1), '^.*/', '') = q.filename
            AND (
              (q.user_role = 'learner' AND l.user_id = q.user_id)
              OR (q.user_role = 'mentor' AND m.user_id = q.user_id)
            )
        ) AS scenario_access,
        EXISTS (
          SELECT 1 FROM public.story_conversations c
          JOIN public.story_sessions s ON s.id = c.session_id
          JOIN public.learners l ON l.id = s.learner_id
          LEFT JOIN public.mentors m ON m.id = l.mentor_id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(c.audio_url, '?', 1), '^.*/', '') = q.filename
            AND (
              (q.user_role = 'learner' AND l.user_id = q.user_id)
              OR (q.user_role = 'mentor' AND m.user_id = q.user_id)
            )
        ) AS story_access,
        EXISTS (
          SELECT 1 FROM public.mentor_resources r
          JOIN public.mentors m ON m.id = r.mentor_id
          LEFT JOIN public.learners l ON l.mentor_id = m.id
          CROSS JOIN request_context q
          WHERE regexp_replace(split_part(r.file_url, '?', 1), '^.*/', '') = q.filename
            AND (
              (q.user_role = 'mentor' AND m.user_id = q.user_id)
              OR (q.user_role = 'learner' AND l.user_id = q.user_id AND r.is_published = TRUE)
            )
        ) AS mentor_resource_access,
        EXISTS (
          SELECT 1 FROM public.reports r
          LEFT JOIN public.learners l ON l.id = r.learner_id
          LEFT JOIN public.mentors m ON m.id = l.mentor_id
          CROSS JOIN request_context q
          WHERE (
            regexp_replace(split_part(r.image_url, '?', 1), '^.*/', '') = q.filename
            OR regexp_replace(split_part(r.video_url, '?', 1), '^.*/', '') = q.filename
          )
          AND (
            r.reporter_id = q.user_id
            OR (q.user_role = 'mentor' AND m.user_id = q.user_id)
            OR q.user_role = 'admin'
          )
        ) AS report_access
    `, [filename, user?.id ?? null, user?.role ?? null]);

    const access = result.rows[0];
    if (
      access.public_avatar ||
      access.public_post_media ||
      access.public_comment_audio ||
      access.community_post_access ||
      access.community_comment_access ||
      access.submission_access ||
      access.speaking_round_access ||
      access.feedback_access ||
      access.scenario_access ||
      access.story_access ||
      access.mentor_resource_access ||
      access.report_access
    ) {
      return { allowed: true };
    }
    return { allowed: false, status: user ? 404 : 401 };
  };
}
