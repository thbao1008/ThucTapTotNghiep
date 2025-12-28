      const content = response.choices?.[0]?.message?.content || "{}";
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        console.warn("âš ï¸ Failed to parse AI response, using fallback");
        return await analyzePronunciationFallback(transcript, expectedText, level);
      }
      
      // Validate parsed response
      if (!parsed || typeof parsed !== 'object') {
        console.warn("âš ï¸ Invalid AI response format, using fallback");
        return await analyzePronunciationFallback(transcript, expectedText, level);
      }
      
      // TÃ­nh missing_words tá»« káº¿t quáº£ phÃ¢n tÃ­ch (cÃ¡c tá»« KHÃ”NG Ä‘Æ°á»£c nÃ³i Ä‘Ãºng)
      // DÃ¹ng cÃ¹ng logic vá»›i matchedWords Ä‘á»ƒ Ä‘áº£m báº£o consistency
      const missingWords = expectedWords.filter(ew => {
        const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
        if (!cleanExpected) return false;
        
        return !transcriptWords.some(tw => {
          const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
          if (!cleanTranscript) return false;
          
          // Exact match
          if (cleanTranscript === cleanExpected) return true;
          
          // Partial match: transcript chá»©a expected
          if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
          
          // Partial match: expected chá»©a transcript (>= 3 kÃ½ tá»±)
          if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
          
          return false;
        });
      });
      
      // TÃ­nh Ä‘iá»ƒm dá»±a trÃªn sá»‘ tá»« Ä‘Ãºng / tá»•ng sá»‘ tá»« (thang 100)
      // ÄÃ¢y lÃ  logic chÃ­nh: Ä‘iá»ƒm = (sá»‘ tá»« Ä‘Ãºng / tá»•ng sá»‘ tá»«) * 100
      const accuracyRatio = matchedWords.length / expectedWords.length;
      const baseScore = accuracyRatio * 100; // Äiá»ƒm cÆ¡ báº£n dá»±a trÃªn sá»‘ tá»« Ä‘Ãºng
      
      console.log(`ðŸ“Š Score calculation: matched=${matchedWords.length}, total=${expectedWords.length}, ratio=${accuracyRatio.toFixed(2)}, baseScore=${baseScore.toFixed(1)}`);
      
      // Náº¿u AI tráº£ vá» score, dÃ¹ng nÃ³ nhÆ°ng khÃ´ng Ä‘Æ°á»£c vÆ°á»£t quÃ¡ baseScore
      // AI score thÆ°á»ng lÃ  thang 10, cáº§n convert sang 100
      const aiScore = parsed.score ? (parsed.score * 10) : null;
      
      // Äiá»ƒm cuá»‘i cÃ¹ng: Æ°u tiÃªn baseScore (dá»±a trÃªn sá»‘ tá»« Ä‘Ãºng), AI chá»‰ Ä‘iá»u chá»‰nh nháº¹
      // Äáº£m báº£o Ä‘iá»ƒm khÃ´ng tháº¥p hÆ¡n 70% cá»§a baseScore vÃ  khÃ´ng vÆ°á»£t quÃ¡ baseScore
      const finalScore = aiScore ? Math.min(Math.max(aiScore, baseScore * 0.7), baseScore) : baseScore;
      
      console.log(`ðŸ“Š Final score: aiScore=${aiScore}, finalScore=${finalScore.toFixed(1)}, missing_words=${missingWords.length}`);
      
      // LÆ°u quick evaluation vÃ o database
      if (roundId && learnerId) {
        await pool.query(
          `INSERT INTO quick_evaluations 
           (round_id, session_id, learner_id, score, feedback, strengths, improvements)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            roundId,
            sessionId,
            learnerId,
            finalScore,
            parsed.feedback || "",
            JSON.stringify(parsed.strengths || []),
            JSON.stringify(parsed.improvements || [])
          ]
        );
      }
      
      return {
        score: Math.round(finalScore), // LÃ m trÃ²n Ä‘iá»ƒm
        feedback: parsed.feedback || "Good effort!",
        errors: [],
        corrected_text: expectedText,
        missing_words: missingWords,
        strengths: parsed.strengths || [],
        improvements: parsed.improvements || []
      };
    } catch (err) {
      // Náº¿u gáº·p lá»—i payment required hoáº·c cÃ¡c lá»—i khÃ¡c, fallback vá» phÆ°Æ¡ng phÃ¡p cÅ©
      console.error("âŒ AI analysis error:", err);
      console.warn("âš ï¸ Falling back to basic pronunciation analysis");
      return await analyzePronunciationFallback(transcript, expectedText, level);
    }
}

/**
 * Fallback cho pronunciation analysis
 */
async function analyzePronunciationFallback(transcript, expectedText, level) {
  // Kiá»ƒm tra náº¿u khÃ´ng nÃ³i gÃ¬
  if (!transcript || !transcript.trim()) {
    return {
      score: 0,
      feedback: "Báº¡n chÆ°a nÃ³i gÃ¬. HÃ£y thá»­ láº¡i vÃ  nÃ³i to, rÃµ rÃ ng.",
      errors: [],
      corrected_text: expectedText,
      missing_words: expectedText.toLowerCase().split(/\s+/).filter(w => w.length > 0),
      strengths: [],
      improvements: ["HÃ£y nÃ³i to vÃ  rÃµ rÃ ng hÆ¡n"]
    };
  }
  
  // TÃ­nh missing_words vÃ  matchedWords vá»›i logic nháº¥t quÃ¡n
  const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const expectedWords = expectedText.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  const matchedWords = expectedWords.filter(ew => {
    const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
    if (!cleanExpected) return false;
    
    return transcriptWords.some(tw => {
      const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
      if (!cleanTranscript) return false;
      
      // Exact match
      if (cleanTranscript === cleanExpected) return true;
      
      // Partial match: transcript chá»©a expected
      if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
      
      // Partial match: expected chá»©a transcript (>= 3 kÃ½ tá»±)
      if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
      
      return false;
    });
  });
  
  // Náº¿u khÃ´ng match tá»« nÃ o, score = 0
  if (matchedWords.length === 0) {
    return {
      score: 0,
      feedback: "Báº¡n chÆ°a nÃ³i Ä‘Ãºng tá»« nÃ o. HÃ£y nghe láº¡i vÃ  nÃ³i theo prompt.",
      errors: [],
      corrected_text: expectedText,
      missing_words: expectedWords,
      strengths: [],
      improvements: ["HÃ£y nghe ká»¹ prompt vÃ  nÃ³i theo Ä‘Ãºng ná»™i dung"]
    };
  }
  
  const prompt = `You are an expert English speaking evaluator. Analyze the following speaking practice:

Expected text: "${expectedText}"
Spoken transcript: "${transcript}"

Provide DETAILED analysis with:
1. Score (0-10): Overall performance
2. Feedback (2-4 sentences): Specific, encouraging, actionable feedback with examples
3. Strengths (2-3 points): Specific examples of what worked well (e.g., "You pronounced 'X' clearly")
4. Improvements (2-3 points): Specific, achievable goals with actionable steps (e.g., "Work on 'th' sound in 'think' - place tongue between teeth")

Return JSON ONLY:
{
  "score": <0-10>,
  "feedback": "<detailed feedback with specific examples>",
  "strengths": ["<specific strength1>", "<strength2>"],
  "improvements": ["<specific improvement1 with steps>", "<improvement2>"]
}`;

  try {
    const response = await aiServiceClient.callOpenRouter(
      [{ role: "user", content: prompt }],
      { 
        model: "openai/gpt-4o", // NÃ¢ng cáº¥p lÃªn GPT-4o cho fallback analysis
        temperature: 0.7, // TÄƒng temperature Ä‘á»ƒ cÃ³ pháº£n há»“i Ä‘a dáº¡ng hÆ¡n
        max_tokens: 500 // TÄƒng tokens Ä‘á»ƒ cÃ³ pháº£n há»“i chi tiáº¿t hÆ¡n
      }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // TÃ­nh missing_words (cÃ¡c tá»« KHÃ”NG Ä‘Æ°á»£c nÃ³i Ä‘Ãºng) - dÃ¹ng cÃ¹ng logic vá»›i matchedWords
    const missingWords = expectedWords.filter(ew => {
      const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
      if (!cleanExpected) return false;
      
      return !transcriptWords.some(tw => {
        const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
        if (!cleanTranscript) return false;
        
        // Exact match
        if (cleanTranscript === cleanExpected) return true;
        
        // Partial match: transcript chá»©a expected
        if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
        
        // Partial match: expected chá»©a transcript (>= 3 kÃ½ tá»±)
        if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
        
        return false;
      });
    });
    
    // TÃ­nh Ä‘iá»ƒm dá»±a trÃªn sá»‘ tá»« Ä‘Ãºng / tá»•ng sá»‘ tá»« (thang 100)
    const accuracyRatio = matchedWords.length / expectedWords.length;
    const baseScore = accuracyRatio * 100; // Äiá»ƒm cÆ¡ báº£n dá»±a trÃªn sá»‘ tá»« Ä‘Ãºng
    
    console.log(`ðŸ“Š Fallback score calculation: matched=${matchedWords.length}, total=${expectedWords.length}, ratio=${accuracyRatio.toFixed(2)}, baseScore=${baseScore.toFixed(1)}`);
    
    // Náº¿u AI tráº£ vá» score (thang 10), convert sang 100 vÃ  Ä‘iá»u chá»‰nh
    const aiScore = parsed.score ? (parsed.score * 10) : null;
    
    // Äiá»ƒm cuá»‘i cÃ¹ng: Æ°u tiÃªn baseScore (dá»±a trÃªn sá»‘ tá»« Ä‘Ãºng), nhÆ°ng cÃ³ thá»ƒ Ä‘iá»u chá»‰nh nháº¹ bá»Ÿi AI
    const finalScore = aiScore ? Math.min(Math.max(aiScore, baseScore * 0.7), baseScore) : baseScore;
    
    console.log(`ðŸ“Š Fallback final score: aiScore=${aiScore}, finalScore=${finalScore.toFixed(1)}, missing_words=${missingWords.length}`);
    
    return {
      score: Math.round(finalScore), // LÃ m trÃ²n Ä‘iá»ƒm (thang 100)
      feedback: parsed.feedback || "Good effort!",
      errors: [],
      corrected_text: expectedText,
      missing_words: missingWords, // CÃ¡c tá»« sai Ä‘á»ƒ highlight
      strengths: parsed.strengths || [],
      improvements: parsed.improvements || []
    };
  } catch (err) {
    // Fallback: tÃ­nh Ä‘iá»ƒm dá»±a trÃªn tá»· lá»‡ tá»« Ä‘Ãºng (thang 100)
    const accuracyRatio = matchedWords.length / expectedWords.length;
    const fallbackScore = accuracyRatio * 100; // Thang 100, khÃ´ng pháº£i 10
    
    // TÃ­nh missing_words vá»›i logic nháº¥t quÃ¡n
    const missingWords = expectedWords.filter(ew => {
      const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
      if (!cleanExpected) return false;
      
      return !transcriptWords.some(tw => {
        const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
        if (!cleanTranscript) return false;
        
        // Exact match
        if (cleanTranscript === cleanExpected) return true;
        
        // Partial match: transcript chá»©a expected
        if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
        
        // Partial match: expected chá»©a transcript (>= 3 kÃ½ tá»±)
        if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
        
        return false;
      });
    });
    
    console.log(`ðŸ“Š Final fallback: score=${fallbackScore.toFixed(1)}, missing_words=${missingWords.length}`);
    
    return {
      score: Math.round(fallbackScore), // Thang 100 - lÃ m trÃ²n Ä‘iá»ƒm
      feedback: `Báº¡n Ä‘Ã£ nÃ³i Ä‘Ãºng ${matchedWords.length}/${expectedWords.length} tá»« (${Math.round(accuracyRatio * 100)}%). ${missingWords.length > 0 ? `Cáº§n cáº£i thiá»‡n cÃ¡c tá»«: ${missingWords.slice(0, 5).join(", ")}` : "Tuyá»‡t vá»i!"}`,
      errors: [],
      corrected_text: expectedText,
      missing_words: missingWords, // CÃ¡c tá»« sai Ä‘á»ƒ highlight
      strengths: matchedWords.length > 0 ? [`ÄÃ£ nÃ³i Ä‘Ãºng ${matchedWords.length}/${expectedWords.length} tá»«`] : [],
      improvements: missingWords.length > 0 ? [`Cáº§n cáº£i thiá»‡n cÃ¡c tá»«: ${missingWords.slice(0, 5).join(", ")}`] : ["Tuyá»‡t vá»i! Báº¡n Ä‘Ã£ nÃ³i Ä‘Ãºng táº¥t cáº£ cÃ¡c tá»«."]
    };
  }
}

/**
 * PhÃ¢n tÃ­ch táº¥t cáº£ cÃ¡c vÃ²ng vÃ  táº¡o tá»•ng káº¿t
 */
export async function analyzeAllRoundsAndSummary(sessionId) {
  // Láº¥y táº¥t cáº£ cÃ¡c rounds chÆ°a Ä‘Æ°á»£c phÃ¢n tÃ­ch
  const rounds = await pool.query(
    `SELECT * FROM speaking_practice_rounds 
     WHERE session_id = $1 
     ORDER BY round_number`,
    [sessionId]
  );

  if (rounds.rows.length === 0) {
    throw new Error("No rounds found");
  }

  // Láº¥y level tá»« session
  const session = await pool.query(
    `SELECT level FROM speaking_practice_sessions WHERE id = $1`,
    [sessionId]
  );
  const level = session.rows[0]?.level || 1;

  // PhÃ¢n tÃ­ch tá»«ng round chÆ°a Ä‘Æ°á»£c phÃ¢n tÃ­ch (xá»­ lÃ½ song song Ä‘á»ƒ nhanh hÆ¡n)
  const roundsToProcess = rounds.rows.filter(r => {
    if (r.analysis && r.score > 0) return false;
    if (!r.audio_url) return false;
    const localPath = r.audio_url.startsWith("/uploads/")
      ? path.join(process.cwd(), r.audio_url)
      : r.audio_url;
    return fs.existsSync(localPath);
  });

  // Xá»­ lÃ½ song song tá»‘i Ä‘a 3 rounds cÃ¹ng lÃºc Ä‘á»ƒ tÄƒng tá»‘c
  const processRound = async (round) => {
    const audioUrl = round.audio_url;
    const localPath = audioUrl.startsWith("/uploads/")
      ? path.join(getProjectRoot(), audioUrl)
      : audioUrl;

    // Transcribe
    let transcript = null;
    try {
      const { json: transcriptJson } = await runWhisperX(localPath, {
        model: "base"
        // computeType khÃ´ng cáº§n chá»‰ Ä‘á»‹nh - tá»± Ä‘á»™ng dÃ¹ng GPU vá»›i float16
      });
      transcript = transcriptJson;
    } catch (err) {
      console.error(`âŒ Transcription error for round ${round.round_number}:`, err);
      return;
    }

    // Analyze vá»›i AI
    let analysis = null;
    let score = 0;
    let feedback = "";
    let errors = [];
    let correctedText = "";

    if (transcript) {
      const transcriptText =
        transcript.text ||
        (transcript.segments || [])
          .map((s) => s.text || "")
          .join(" ");

      try {
        // Láº¥y learner_id tá»« session
        const sessionInfo = await pool.query(
          `SELECT learner_id FROM speaking_practice_sessions WHERE id = $1`,
          [sessionId]
        );
        const learnerId = sessionInfo.rows[0]?.learner_id;
        
        // Sá»­ dá»¥ng quick analysis vá»›i Python trainer
        analysis = await analyzePronunciation(
          transcriptText, 
          round.prompt, 
          level,
          round.id, // roundId
          sessionId,
          learnerId
        );
        score = Math.round(analysis.score || 0); // LÃ m trÃ²n Ä‘iá»ƒm
        feedback = analysis.feedback || "";
        errors = analysis.errors || [];
        correctedText = analysis.corrected_text || "";
      } catch (err) {
        console.error(`âŒ AI analysis error for round ${round.round_number}:`, err);
        feedback = "KhÃ´ng thá»ƒ phÃ¢n tÃ­ch. Vui lÃ²ng thá»­ láº¡i.";
      }
    }

    // Build word_analysis tá»« transcript (náº¿u cÃ³)
    let wordAnalysis = [];
    if (transcript && transcript.words && Array.isArray(transcript.words)) {
      wordAnalysis = transcript.words.map((w, idx) => ({
        word: w.text ?? w.word ?? "",
        start: typeof w.start === "number" ? w.start : null,
        end: typeof w.end === "number" ? w.end : null,
        confidence: typeof w.score === "number" ? w.score : w.confidence ?? null,
        wordIndex: idx
      }));
    }
    
    // Cáº­p nháº­t database vá»›i káº¿t quáº£ (bao gá»“m missing_words)
    // LÆ°u Ã½: word_analysis khÃ´ng cÃ³ trong schema, chá»‰ lÆ°u trong analysis
    await pool.query(
      `UPDATE speaking_practice_rounds 
       SET transcript = $1, score = $2, analysis = $3
       WHERE id = $4`,
      [
        JSON.stringify(transcript),
        score,
        JSON.stringify({
          feedback,
          errors,
          corrected_text: correctedText,
          score,
          missing_words: analysis?.missing_words || [],
          word_analysis: wordAnalysis.length > 0 ? wordAnalysis : []
        }),
        round.id
      ]
    );
  };

  // Xá»­ lÃ½ song song vá»›i batch size = 3
  const batchSize = 3;
  for (let i = 0; i < roundsToProcess.length; i += batchSize) {
    const batch = roundsToProcess.slice(i, i + batchSize);
    await Promise.all(batch.map(round => processRound(round)));
  }

  // Sau khi phÃ¢n tÃ­ch xong, táº¡o summary
  return await generateSummary(sessionId);
}

/**
 * Táº¡o tá»•ng káº¿t sau 10 vÃ²ng
 */
export async function generateSummary(sessionId) {
  const rounds = await pool.query(
    `SELECT * FROM speaking_practice_rounds 
     WHERE session_id = $1 
     ORDER BY round_number`,
    [sessionId]
  );

  if (rounds.rows.length === 0) {
    throw new Error("No rounds found");
  }

  // TÃ­nh Ä‘iá»ƒm tá»•ng káº¿t: cá»™ng táº¥t cáº£ Ä‘iá»ƒm 10 cÃ¢u, chia cho 10, lÃ m trÃ²n
  const totalScore = rounds.rows.reduce((sum, r) => sum + (parseFloat(r.score) || 0), 0);
  const averageScore = Math.round(totalScore / 10); // LuÃ´n chia cho 10 (10 cÃ¢u), lÃ m trÃ²n

  // Táº¡o tá»•ng káº¿t vá»›i AI (tá»‘i Æ°u cho tá»‘c Ä‘á»™)
  const summaryPrompt = `Summary: ${rounds.rows.length} rounds, avg ${averageScore.toFixed(1)}/100.
Scores: ${rounds.rows.map((r, i) => `R${i+1}:${r.score}`).join(" ")}.

Return JSON only:
{"overall_feedback": "brief", "common_mistakes": ["m1"], "strengths": ["s1"], "improvements": ["i1"], "encouragement": "brief"}`;

  let summaryData = {
    overall_feedback: "Good effort! Keep practicing.",
    common_mistakes: [],
    strengths: [],
    improvements: [],
    encouragement: "You're making progress!"
  };

  try {
    const response = await aiServiceClient.callOpenRouter(
      [{ role: "user", content: summaryPrompt }],
      { 
        model: "openai/gpt-4o-mini", 
        temperature: 0.5, // Giáº£m temperature
        max_tokens: 400 // Giáº£m max_tokens
      }
    );

    let content = response.choices?.[0]?.message?.content || "{}";
    
    // Parse JSON (handle markdown code blocks if any)
    content = content.trim();
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/;
    const codeBlockMatch = content.match(codeBlockRegex);
    if (codeBlockMatch && codeBlockMatch[1]) {
      content = codeBlockMatch[1].trim();
    }
    
    // Extract JSON náº¿u cÃ³ text trÆ°á»›c/sau
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      content = content.substring(firstBrace, lastBrace + 1);
    }
    
    summaryData = JSON.parse(content);
  } catch (err) {
    console.error("âŒ Summary generation error:", err);
    // KhÃ´ng log response vÃ¬ cÃ³ thá»ƒ undefined khi error
    if (err.response) {
      console.error("Error response:", err.response);
    }
  }

  // Update session
  await pool.query(
    `UPDATE speaking_practice_sessions 
     SET status = 'completed',
         total_score = $1,
         average_score = $2,
         summary = $3,
         completed_at = NOW()
     WHERE id = $4`,
    [totalScore, Math.round(averageScore), JSON.stringify(summaryData), sessionId]
  );

  // LÆ°u vÃ o practice_history Ä‘á»ƒ tracking tiáº¿n Ä‘á»™
  const sessionInfo = await pool.query(
    `SELECT learner_id, level, created_at, completed_at 
     FROM speaking_practice_sessions 
     WHERE id = $1`,
    [sessionId]
  );
  
  if (sessionInfo.rows[0]) {
    const session = sessionInfo.rows[0];
    const duration = session.completed_at && session.created_at
      ? Math.round((new Date(session.completed_at) - new Date(session.created_at)) / 60000)
      : null;
    
    // Láº¥y strengths vÃ  improvements tá»« quick evaluations
    const evaluations = await pool.query(
      `SELECT strengths, improvements FROM quick_evaluations 
       WHERE session_id = $1`,
      [sessionId]
    );
    
    const allStrengths = [];
    const allImprovements = [];
    evaluations.rows.forEach(e => {
      if (e.strengths) {
        try {
          const s = typeof e.strengths === 'string' ? JSON.parse(e.strengths) : e.strengths;
          if (Array.isArray(s)) allStrengths.push(...s);
        } catch {}
      }
      if (e.improvements) {
        try {
          const i = typeof e.improvements === 'string' ? JSON.parse(e.improvements) : e.improvements;
          if (Array.isArray(i)) allImprovements.push(...i);
        } catch {}
      }
    });
    
    // LÆ°u practice history - chá»‰ lÆ°u Ä‘iá»ƒm
    // Kiá»ƒm tra xem Ä‘Ã£ cÃ³ record chÆ°a
    const existing = await pool.query(
      `SELECT id FROM practice_history WHERE session_id = $1`,
      [sessionId]
    );
    
    if (existing.rows.length > 0) {
      // Update existing record
      await pool.query(
        `UPDATE practice_history 
         SET total_score = $1,
             average_score = $2,
             duration_minutes = $3
         WHERE session_id = $4`,
        [totalScore, Math.round(averageScore), duration, sessionId]
      );
    } else {
      // Insert new record
      await pool.query(
        `INSERT INTO practice_history 
         (learner_id, session_id, practice_type, level, total_score, average_score, duration_minutes)
         VALUES ($1, $2, 'speaking_practice', $3, $4, $5, $6)`,
        [
          session.learner_id,
          sessionId,
          session.level,
          totalScore,
          Math.round(averageScore),
          duration
        ]
      );
    }
  }

  // Parse missing_words tá»« analysis cho má»—i round
  const roundsWithMissingWords = rounds.rows.map(round => {
    let missingWords = [];
    if (round.analysis) {
      try {
        const analysis = typeof round.analysis === 'string' 
          ? JSON.parse(round.analysis) 
          : round.analysis;
        missingWords = analysis.missing_words || [];
      } catch (e) {
        // Ignore parse errors
      }
    }
    return {
      ...round,
      missing_words: missingWords
    };
  });

  return {
    total_score: totalScore,
    average_score: Math.round(averageScore), // LÃ m trÃ²n Ä‘iá»ƒm trung bÃ¬nh
    ...summaryData,
