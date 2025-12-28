// Learner Service - Queue Handlers
import { registerProcessor } from "./utils/queue.js";
import * as learnerService from "./services/learnerService.js";
// TODO: Replace with API calls to AI Service
// import * as learnerAiService from "./services/learnerAiService.js";
import { runWhisperX } from "./utils/whisperxRunner.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pool from "./config/db.js";

/**
 * Tìm project root (đi lên từ learner-service/src đến backend)
 */
function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // __dirname = backend/services/learner-service/src
  // Go up 3 levels: src -> learner-service -> services -> backend
  return path.resolve(__dirname, "..", "..", "..");
}

function audioUrlToLocalPath(audioUrl) {
  const m = String(audioUrl || "").match(/\/uploads\/(.+)$/);
  if (!m) return null;
  const filename = m[1];
  // Tìm file ở backend/uploads/
  const backendDir = getProjectRoot();
  return path.resolve(backendDir, "uploads", filename);
}

// Queue handler để xử lý submission analysis
registerProcessor("analyzeSubmission", async (job) => {
  const { submissionId } = job.data;
  console.log("🔄 Processing analyzeSubmission job:", submissionId);

  const sub = await learnerService.getSubmissionById(submissionId);
  if (!sub) {
    console.warn("⚠️ Submission not found:", submissionId);
    return;
  }

  let transcript = sub.transcript ?? null;

  // Nếu chưa có transcript thì chạy WhisperX
  if (!transcript) {
    if (!sub.audio_url) {
      console.warn("⚠️ No audio_url to transcribe:", submissionId);
      await learnerService.updateSubmissionStatus(submissionId, "failed");
      return;
    }

    const localPath = audioUrlToLocalPath(sub.audio_url);
    if (!localPath || !fs.existsSync(localPath)) {
      console.error("❌ Local audio file not found:", localPath);
      await learnerService.updateSubmissionStatus(submissionId, "failed");
      return;
    }

    try {
      console.log("🔊 Transcribing audio:", localPath);
      const { json: transcriptJson } = await runWhisperX(localPath, {
        model: "base",
        computeType: "float32",
        timeoutMs: 3 * 60 * 1000,
      });

      if (transcriptJson) {
        await learnerService.updateSubmissionTranscript(submissionId, transcriptJson);
        transcript = transcriptJson;

        if (Array.isArray(transcriptJson.segments)) {
          await learnerService.updateSubmissionSegments(submissionId, transcriptJson.segments);
        }

        console.log("📝 Transcript + segments saved:", submissionId);
      } else {
        console.warn("⚠️ Empty transcript JSON:", submissionId);
        await learnerService.updateSubmissionStatus(submissionId, "pending_transcription");
        return;
      }
    } catch (err) {
      console.error("❌ Transcription failed:", submissionId, err);
      await learnerService.updateSubmissionStatus(submissionId, "failed");
      return;
    }
  }

  // Phân tích transcript bằng AI Service
  try {
    console.log("🧠 Analyzing transcript:", submissionId);

    const challenge = await learnerService.getChallengeById(sub.challenge_id);

    // Gọi qua API Gateway thay vì trực tiếp đến AI Service
    // Extract transcript text - handle both object and string formats
    let transcriptText = "";
    if (typeof transcript === "string") {
      transcriptText = transcript;
    } else if (transcript && typeof transcript === "object") {
      transcriptText = transcript.text || (transcript.segments || []).map(s => s.text || "").join(" ") || "";
    }
    
    if (!transcriptText || transcriptText.trim().length === 0) {
      console.error("❌ Empty transcript text:", submissionId);
      await learnerService.updateSubmissionStatus(submissionId, "failed");
      return;
    }

    console.log(`[DEBUG] Sending transcript to AI Service (length: ${transcriptText.length}):`, transcriptText.substring(0, 100) + "...");
    
    const response = await fetch(`http://localhost:${process.env.API_GATEWAY_PORT || 4000}/api/ai/learner/analyze-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: transcriptText,
        options: {
          runTopicDetection: true,
          challenge,
          sampleTranscripts: []
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`❌ AI Service error ${response.status}:`, errorText);
      throw new Error(`AI Service error: ${response.status} - ${errorText}`);
    }

    const analysis = await response.json();

    if (!analysis || typeof analysis !== "object") {
      console.error("❌ Invalid analysis result:", submissionId, analysis);
      await learnerService.updateSubmissionStatus(submissionId, "failed");
      return;
    }

    await learnerService.updateSubmissionAnalysis(submissionId, { ...analysis, transcript });
    await learnerService.updateSubmissionStatus(submissionId, "completed");
    console.log("✅ AI analysis saved:", submissionId);
  } catch (err) {
    console.error("❌ AI analysis failed:", submissionId, err);
    await learnerService.updateSubmissionStatus(submissionId, "failed");
  }
});

// Queue handler để xử lý speaking round (transcription + AI analysis)
registerProcessor("processSpeakingRound", async (job) => {
  console.log("🚀 QUEUE HANDLER STARTED for speaking round");
  const { roundId, sessionId, audioUrl, prompt, level, time_taken, webSpeechTranscript, webSpeechHighlights: originalWebSpeechHighlights } = job.data;
  let webSpeechHighlights = originalWebSpeechHighlights; // Mutable copy
  console.log("🔄 Processing speaking round:", roundId);
  console.log("🎤 Web Speech data received:", {
    hasTranscript: !!webSpeechTranscript,
    highlightsLength: webSpeechHighlights ? webSpeechHighlights.length : 0,
    highlights: webSpeechHighlights
  });

  try {
    // Transcribe audio
    const backendDir = getProjectRoot();
    const localPath = audioUrl.startsWith("/uploads/")
      ? path.join(backendDir, audioUrl)
      : audioUrl;

    let transcript = null;
    if (fs.existsSync(localPath)) {
      console.log(`📁 Audio file exists: ${localPath}`);
      try {
        console.log(`🎙️ Starting WhisperX transcription with model medium...`);
        const { json: transcriptJson } = await runWhisperX(localPath, {
          model: "medium",
          language: "en",
          computeType: "float32"
        });
        transcript = transcriptJson;
        console.log(`✅ WhisperX transcription completed: ${transcript?.text?.substring(0, 100)}...`);
      } catch (err) {
        console.error("❌ Transcription error:", err.message);
        console.error("❌ Error stack:", err.stack);
        console.error("❌ Trying with base model...");
        // Fallback to base model
        try {
          const { json: transcriptJson } = await runWhisperX(localPath, {
            model: "base",
            computeType: "float32"
          });
          transcript = transcriptJson;
          console.log(`✅ WhisperX base model transcription completed: ${transcript?.text?.substring(0, 100)}...`);
        } catch (err2) {
          console.error("❌ Base model also failed:", err2.message);
          // Không return, tiếp tục với transcript = null
        }
      }
    } else {
      console.error(`❌ Audio file not found: ${localPath}`);
    }

    // Nếu không có Web Speech highlights, tạo từ WhisperX transcript
    if ((!webSpeechHighlights || !Array.isArray(webSpeechHighlights) || webSpeechHighlights.length === 0) && transcript && transcript.text) {
      console.log(`🔄 Generating highlights from WhisperX transcript...`);
      const transcriptText = transcript.text;
      const transcriptWords = transcriptText.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      const expectedWords = prompt.toLowerCase().split(/\s+/).map(w => w.replace(/[.,!?;:]/g, "")).filter(w => w.length > 0);
      
      // Tạo highlights bằng cách match transcript words với expected words
      const generatedHighlights = [];
      expectedWords.forEach((expectedWord, idx) => {
        const cleanExpected = expectedWord.replace(/[.,!?;:]/g, "").trim();
        if (!cleanExpected) return;
        
        const matched = transcriptWords.some(transcriptWord => {
          const cleanTranscript = transcriptWord.replace(/[.,!?;:]/g, "").trim();
          if (!cleanTranscript) return false;
          if (cleanTranscript === cleanExpected) return true;
          if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
          if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
          return false;
        });
        
        if (matched) {
          generatedHighlights.push(idx);
        }
      });
      
      webSpeechHighlights = generatedHighlights;
      console.log(`✅ Generated ${generatedHighlights.length} highlights from WhisperX:`, generatedHighlights);
    }

    // Analyze với AI Service
    let analysis = null;
    let score = 0;
    let feedback = "";
    let errors = [];
    let correctedText = "";

    // ƯU TIÊN 1: Nếu có Web Speech highlights, dùng chúng để tính điểm ngay
    if (webSpeechHighlights && Array.isArray(webSpeechHighlights) && webSpeechHighlights.length > 0) {
      console.log(`🎯 Using Web Speech highlights for scoring: ${webSpeechHighlights.length} matched words`);
      console.log(`🔍 Highlights data:`, webSpeechHighlights);
      console.log(`🔍 Highlights types:`, webSpeechHighlights.map(h => typeof h));
      
      // Convert to numbers if they're strings
      const numericHighlights = webSpeechHighlights.map(h => typeof h === 'string' ? parseInt(h, 10) : h);
      console.log(`🔢 Numeric highlights:`, numericHighlights);
      
      const expectedWords = prompt.toLowerCase().split(/\s+/).map(w => w.replace(/[.,!?;:]/g, "")).filter(w => w.length > 0);
      const matchedWords = expectedWords.filter((_, idx) => numericHighlights.includes(idx));
      const missingWords = expectedWords.filter((_, idx) => !numericHighlights.includes(idx));
      
      // Tính điểm dựa trên highlights từ Web Speech
      const scoreFromHighlights = Math.round((matchedWords.length / expectedWords.length) * 100);
      
      score = scoreFromHighlights;
      feedback = scoreFromHighlights > 0 
        ? `Bạn đã nói đúng ${matchedWords.length}/${expectedWords.length} từ. ${missingWords.length > 0 ? `Cần cải thiện: ${missingWords.slice(0, 5).join(", ")}` : "Tuyệt vời!"}`
        : "Bạn chưa nói đúng từ nào. Hãy nghe lại và nói theo prompt.";
      analysis = {
        score: scoreFromHighlights,
        feedback: feedback,
        missing_words: missingWords,
        errors: [],
        corrected_text: prompt
      };
      
      console.log(`✅ Web Speech scoring: ${scoreFromHighlights}/100, matched=${matchedWords.length}/${expectedWords.length}`);
    } else if (webSpeechTranscript && webSpeechTranscript.trim()) {
      // Fallback: Dùng Web Speech transcript để tính điểm
      console.log(`🎤 Using Web Speech transcript for scoring: "${webSpeechTranscript.substring(0, 100)}..."`);
      
      const transcriptWords = webSpeechTranscript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      const expectedWords = prompt.toLowerCase().split(/\s+/).map(w => w.replace(/[.,!?;:]/g, "")).filter(w => w.length > 0);
      
      // Tính số từ match từ Web Speech transcript
      const matchedWords = expectedWords.filter(ew => {
        const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
        if (!cleanExpected) return false;
        return transcriptWords.some(tw => {
          const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
          if (!cleanTranscript) return false;
          if (cleanTranscript === cleanExpected) return true;
          if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
          if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
          return false;
        });
      });
      
      // Tính điểm dựa trên số từ đúng
      const scoreFromTranscript = Math.round((matchedWords.length / expectedWords.length) * 100);
      const missingWords = expectedWords.filter(ew => !matchedWords.includes(ew));
      
      score = scoreFromTranscript;
      feedback = scoreFromTranscript > 0 
        ? `Bạn đã nói đúng ${matchedWords.length}/${expectedWords.length} từ. ${missingWords.length > 0 ? `Cần cải thiện: ${missingWords.slice(0, 5).join(", ")}` : "Tuyệt vời!"}`
        : "Không thể phân tích chính xác. Vui lòng thử lại.";
      analysis = {
        score: scoreFromTranscript,
        feedback: feedback,
        missing_words: missingWords,
        errors: [],
        corrected_text: prompt
      };
      
      console.log(`✅ Web Speech transcript scoring: ${scoreFromTranscript}/100, matched=${matchedWords.length}/${expectedWords.length}`);
    } else if (transcript) {
      const transcriptText = transcript.text || (transcript.segments || []).map(s => s.text || "").join(" ");

      try {
        // QUAN TRỌNG: Dùng analyzePronunciation trực tiếp thay vì gọi API
        // Để đảm bảo logic tính điểm dựa trên số từ đúng được áp dụng
        const { analyzePronunciation } = await import("./services/speakingPracticeService.js");
        
        // Lấy learner_id từ session
        const sessionInfo = await pool.query(
          `SELECT learner_id FROM speaking_practice_sessions WHERE id = $1`,
          [sessionId]
        );
        const learnerId = sessionInfo.rows[0]?.learner_id;
        
        analysis = await analyzePronunciation(transcriptText, prompt, level, roundId, sessionId, learnerId);
        score = Math.round(analysis.score || 0);
        feedback = analysis.feedback || "";
        errors = analysis.errors || [];
        correctedText = analysis.corrected_text || "";
        
        console.log(`✅ WhisperX analyzed, score=${score}, missing_words=${analysis?.missing_words?.length || 0}`);
      } catch (err) {
        console.error("❌ AI analysis error in queue handler:", err);
        console.error("❌ Error stack:", err.stack);
        
        // Fallback cuối: Tính điểm dựa trên transcript matching
        if (transcriptText && transcriptText.trim()) {
          const transcriptWords = transcriptText.toLowerCase().split(/\s+/).filter(w => w.length > 0);
          const expectedWords = prompt.toLowerCase().split(/\s+/).map(w => w.replace(/[.,!?;:]/g, "")).filter(w => w.length > 0);
          
          // Tính số từ match
          const matchedWords = expectedWords.filter(ew => {
            const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
            if (!cleanExpected) return false;
            return transcriptWords.some(tw => {
              const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
              if (!cleanTranscript) return false;
              if (cleanTranscript === cleanExpected) return true;
              if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
              if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
              return false;
            });
          });
          
          // Tính điểm dựa trên số từ đúng
          const fallbackScore = matchedWords.length > 0 
            ? Math.round((matchedWords.length / expectedWords.length) * 100)
            : 0;
          
          const missingWords = expectedWords.filter(ew => !matchedWords.includes(ew));
          
          score = fallbackScore;
          feedback = fallbackScore > 0 
            ? `Bạn đã nói đúng ${matchedWords.length}/${expectedWords.length} từ. ${missingWords.length > 0 ? `Cần cải thiện: ${missingWords.slice(0, 5).join(", ")}` : "Tuyệt vời!"}`
            : "Không thể phân tích chính xác. Vui lòng thử lại.";
          analysis = {
            score: fallbackScore,
            feedback: feedback,
            missing_words: missingWords,
            errors: [],
            corrected_text: prompt
          };
          
          console.log(`⚠️ Using transcript fallback scoring: score=${fallbackScore}, matched=${matchedWords.length}/${expectedWords.length}`);
        } else {
          // Không có transcript
          feedback = "Bạn chưa nói gì. Hãy thử lại và nói to, rõ ràng.";
          score = 0;
          analysis = {
            score: 0,
            feedback: feedback,
            missing_words: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 0),
            errors: [],
            corrected_text: prompt
          };
        }
      }
    } else {
      // Không có transcript từ WhisperX, kiểm tra Web Speech data
      if (webSpeechHighlights && Array.isArray(webSpeechHighlights) && webSpeechHighlights.length > 0) {
        console.log(`🎯 Using Web Speech highlights (no WhisperX transcript): ${webSpeechHighlights.length} matched words`);
        
        const expectedWords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const matchedWords = expectedWords.filter((_, idx) => webSpeechHighlights.includes(idx));
        const missingWords = expectedWords.filter((_, idx) => !webSpeechHighlights.includes(idx));
        
        // Tính điểm dựa trên highlights từ Web Speech
        const scoreFromHighlights = Math.round((matchedWords.length / expectedWords.length) * 100);
        
        score = scoreFromHighlights;
        feedback = scoreFromHighlights > 0 
          ? `Bạn đã nói đúng ${matchedWords.length}/${expectedWords.length} từ. ${missingWords.length > 0 ? `Cần cải thiện: ${missingWords.slice(0, 5).join(", ")}` : "Tuyệt vời!"}`
          : "Bạn chưa nói đúng từ nào. Hãy nghe lại và nói theo prompt.";
        analysis = {
          score: scoreFromHighlights,
          feedback: feedback,
          missing_words: missingWords,
          errors: [],
          corrected_text: prompt
        };
        
        console.log(`✅ Web Speech scoring (no transcript): ${scoreFromHighlights}/100, matched=${matchedWords.length}/${expectedWords.length}`);
      } else if (webSpeechTranscript && webSpeechTranscript.trim()) {
        // Fallback: Dùng Web Speech transcript
        console.log(`🎤 Using Web Speech transcript (no WhisperX): "${webSpeechTranscript.substring(0, 100)}..."`);
        
        const transcriptWords = webSpeechTranscript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const expectedWords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        const matchedWords = expectedWords.filter(ew => {
          const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
          if (!cleanExpected) return false;
          return transcriptWords.some(tw => {
            const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
            if (!cleanTranscript) return false;
            if (cleanTranscript === cleanExpected) return true;
            if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
            if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
            return false;
          });
        });
        
        const scoreFromTranscript = Math.round((matchedWords.length / expectedWords.length) * 100);
        const missingWords = expectedWords.filter(ew => !matchedWords.includes(ew));
        
        score = scoreFromTranscript;
        feedback = scoreFromTranscript > 0 
          ? `Bạn đã nói đúng ${matchedWords.length}/${expectedWords.length} từ. ${missingWords.length > 0 ? `Cần cải thiện: ${missingWords.slice(0, 5).join(", ")}` : "Tuyệt vời!"}`
          : "Không thể phân tích chính xác. Vui lòng thử lại.";
        analysis = {
          score: scoreFromTranscript,
          feedback: feedback,
          missing_words: missingWords,
          errors: [],
          corrected_text: prompt
        };
        
        console.log(`✅ Web Speech transcript scoring (no WhisperX): ${scoreFromTranscript}/100, matched=${matchedWords.length}/${expectedWords.length}`);
      } else {
        score = 0;
        feedback = "Bạn chưa nói gì. Hãy thử lại và nói to, rõ ràng.";
        analysis = {
          score: 0,
          feedback: feedback,
          missing_words: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 0),
          errors: [],
          corrected_text: prompt
        };
      }
    }

    // Build word_analysis từ transcript
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

    // Cập nhật database với kết quả (bao gồm missing_words để highlight từ sai)
    console.log(`📊 Final score before DB update: ${score}, analysis score: ${analysis?.score}`);
    try {
      await pool.query(
        `UPDATE speaking_practice_rounds 
         SET transcript = $1, score = $2, analysis = $3
         WHERE id = $4`,
        [
          transcript ? JSON.stringify(transcript) : null,
          score,
          JSON.stringify({
            feedback,
            errors,
            corrected_text: correctedText || prompt,
            score,
            missing_words: analysis?.missing_words || [], // Các từ sai để highlight
            word_analysis: wordAnalysis.length > 0 ? wordAnalysis : []
          }),
          roundId
        ]
      );
      console.log(`✅ Queue handler: Updated round ${roundId} with score ${score}, missing_words=${analysis?.missing_words?.length || 0}`);
    } catch (dbErr) {
      console.error(`❌ Database update error in queue handler for round ${roundId}:`, dbErr);
    }

    console.log("✅ Speaking round processed:", roundId);
  } catch (err) {
    console.error("❌ Process speaking round error:", err);
  }
});

