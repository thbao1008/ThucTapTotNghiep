// Learner Service - Speaking Practice Service
import pool from "../config/db.js";
import { runWhisperX } from "../utils/whisperxRunner.js";
// TODO: Replace with API calls to AI Service
// import * as learnerAiService from "./learnerAiService.js";
// import * as aiService from "./aiService.js";
// import * as trainedAIService from "./trainedAIService.js";
import * as aiServiceClient from "../utils/aiServiceClient.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

/**
 * TÃ¬m project root (Ä‘i lÃªn tá»« learner-service/src/services Ä‘áº¿n root)
 */
function getProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // __dirname = backend/services/learner-service/src/services
  // Go up 4 levels: services -> src -> learner-service -> services -> backend
  // .. -> src
  // .. -> learner-service
  // .. -> services
  // .. -> backend âœ…
  const backendDir = path.resolve(__dirname, "..", "..", "..", "..");
  
  console.log("ðŸ” getProjectRoot() called from speakingPracticeService.js:", {
    __dirname: __dirname,
    backendDir: backendDir,
    aiModelsDir: path.join(backendDir, "ai_models"),
    aiModelsExists: fs.existsSync(path.join(backendDir, "ai_models"))
  });
  
  return backendDir;
}

// QUAN TRá»ŒNG: KhÃ´ng cÃ²n hardcoded prompts
// Táº¥t cáº£ prompts Ä‘Æ°á»£c generate bá»Ÿi AI trainer trong ai_models/comprehensiveAITrainer.py
// Training data náº±m trong ai_models/promptSamples.json

/**
 * TÃ­nh thá»i gian cá»‘ Ä‘á»‹nh cho táº¥t cáº£ cÃ¡c vÃ²ng
 * Dá»±a trÃªn thá»i gian ngÆ°á»i giá»i tiáº¿ng Anh nÃ³i cÃ¢u khÃ³ (30-40 tá»«) trong khoáº£ng 10-15 giÃ¢y
 * Set thá»i gian cá»‘ Ä‘á»‹nh lÃ  18 giÃ¢y cho táº¥t cáº£ cÃ¡c vÃ²ng (báº¥t ká»ƒ má»©c Ä‘á»™ dá»…/khÃ³)
 */
function calculateTimeLimit(text, level) {
  // Thá»i gian cá»‘ Ä‘á»‹nh: 18 giÃ¢y cho táº¥t cáº£ cÃ¡c vÃ²ng
  // NgÆ°á»i giá»i tiáº¿ng Anh nÃ³i cÃ¢u khÃ³ (30-40 tá»«) trong khoáº£ng 10-15 giÃ¢y
  // ThÃªm buffer 3 giÃ¢y cho ngÆ°á»i há»c = 18 giÃ¢y
  return 18;
}

/**
 * Khá»Ÿi táº¡o learning tá»« cÃ¡c nguá»“n (cháº¡y má»™t láº§n khi server start)
 */
export async function initializeAILearning() {
  try {
    // Kiá»ƒm tra xem Ä‘Ã£ há»c chÆ°a
    const existing = await pool.query(
      `SELECT COUNT(*) as count FROM ai_learning_context LIMIT 1`
    );
    
    if (parseInt(existing.rows[0]?.count || 0) === 0) {
      console.log("ðŸ¤– Initializing AI learning from available sources...");
      await learnFromAvailableSources();
      console.log("âœ… AI learning initialized");
    }
  } catch (err) {
    console.error("âŒ Error initializing AI learning:", err);
  }
}

/**
 * Táº¡o session má»›i cho luyá»‡n nÃ³i
 * Kiá»ƒm tra xem cÃ³ session Ä‘ang dá»Ÿ dang khÃ´ng, náº¿u cÃ³ thÃ¬ báº¯t buá»™c pháº£i hoÃ n thÃ nh trÆ°á»›c
 */
export async function createPracticeSession(learnerId, level) {
  // Äáº£m báº£o AI Ä‘Ã£ há»c tá»« cÃ¡c nguá»“n
  await initializeAILearning();
  
  // Kiá»ƒm tra xem cÃ³ session Ä‘ang dá»Ÿ dang khÃ´ng (status = 'active' vÃ  chÆ°a completed)
  const existingSession = await pool.query(
    `SELECT id, created_at, 
       (SELECT COUNT(*) FROM speaking_practice_rounds WHERE session_id = speaking_practice_sessions.id) as rounds_count
     FROM speaking_practice_sessions 
     WHERE learner_id = $1 
       AND mode = 'practice'
       AND status = 'active'
       AND completed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [learnerId]
  );

  if (existingSession.rows.length > 0) {
    const session = existingSession.rows[0];
    const roundsCount = parseInt(session.rounds_count || 0);
    
    // Náº¿u session Ä‘ang dá»Ÿ dang (chÆ°a Ä‘á»§ 10 rounds), throw error
    if (roundsCount < 10) {
      throw new Error(`Báº¡n Ä‘ang cÃ³ má»™t bÃ i luyá»‡n táº­p chÆ°a hoÃ n thÃ nh (${roundsCount}/10 vÃ²ng). Vui lÃ²ng hoÃ n thÃ nh bÃ i Ä‘Ã³ trÆ°á»›c khi báº¯t Ä‘áº§u bÃ i má»›i.`);
    }
  }
  
  const result = await pool.query(
    `INSERT INTO speaking_practice_sessions (learner_id, level, mode, status)
     VALUES ($1, $2, 'practice', 'active')
     RETURNING *`,
    [learnerId, level]
  );
  return result.rows[0];
}

/**
 * Táº¡o session má»›i cho Tell me your story
 */
export async function createStorySession(learnerId) {
  const result = await pool.query(
    `INSERT INTO speaking_practice_sessions (learner_id, level, mode, status)
     VALUES ($1, 1, 'story', 'active')
     RETURNING *`,
    [learnerId]
  );
  return result.rows[0];
}

/**
 * AI tá»± há»c tá»« cÃ¡c nguá»“n cÃ³ sáºµn (scenarios, topics, etc.)
 */
async function learnFromAvailableSources() {
  try {
    // Há»c tá»« scenarios
    const scenarios = await pool.query(
      `SELECT id, vocabulary, initial_prompt, difficulty_level 
       FROM speaking_scenarios 
       WHERE vocabulary IS NOT NULL 
       LIMIT 20`
    );

    for (const scenario of scenarios.rows) {
      if (scenario.vocabulary && scenario.initial_prompt) {
        // LÆ°u vÃ o learning context
        try {
          // Äáº£m báº£o vocabulary lÃ  JSON há»£p lá»‡
          let vocabularyJson = scenario.vocabulary;
          
          // Náº¿u Ä‘Ã£ lÃ  object (tá»« JSONB), convert sang JSON string
          if (typeof vocabularyJson === 'object' && vocabularyJson !== null) {
            vocabularyJson = JSON.stringify(vocabularyJson);
          } else if (typeof vocabularyJson === 'string') {
            // Náº¿u lÃ  string, kiá»ƒm tra xem cÃ³ pháº£i JSON há»£p lá»‡ khÃ´ng
            try {
              JSON.parse(vocabularyJson);
              // Náº¿u parse Ä‘Æ°á»£c, giá»¯ nguyÃªn string
            } catch (e) {
              // Náº¿u khÃ´ng parse Ä‘Æ°á»£c, bá» qua vocabulary
              vocabularyJson = null;
            }
          } else {
            vocabularyJson = null;
          }
          
          await pool.query(
            `INSERT INTO ai_learning_context (source_type, source_id, content, vocabulary, level)
             VALUES ('scenario', $1, $2, $3::jsonb, $4)
             ON CONFLICT (source_type, source_id, content) DO NOTHING`,
            [
              scenario.id || null,
              scenario.initial_prompt,
              vocabularyJson,
              scenario.difficulty_level || 1
            ]
          );
        } catch (err) {
          // Ignore duplicate errors vÃ  conflict errors
          if (!err.message.includes('duplicate') && 
              !err.message.includes('conflict') && 
              err.code !== '23505') {
            console.error("Error inserting learning context:", err.message);
          }
        }
      }
    }

    // QUAN TRá»ŒNG: KhÃ´ng cÃ²n há»c tá»« hardcoded prompts
    // AI sáº½ há»c tá»« promptSamples.json trong ai_models/comprehensiveAITrainer.py
    // vÃ  tá»« sampleTranscripts.json

    // Há»c tá»« sampleTranscripts.json náº¿u cÃ³
    try {
      const backendDir = getProjectRoot();
      const sampleTranscriptsPath = path.join(backendDir, "ai_models", "sampleTranscripts.json");
      if (fs.existsSync(sampleTranscriptsPath)) {
        const sampleData = JSON.parse(fs.readFileSync(sampleTranscriptsPath, "utf-8"));
        for (const item of sampleData) {
          if (item.topic && item.text) {
            const words = item.text.split(/\s+/).length;
            // XÃ¡c Ä‘á»‹nh level dá»±a trÃªn Ä‘á»™ dÃ i
            const estimatedLevel = words <= 15 ? 1 : words <= 30 ? 2 : 3;
            
            try {
              await pool.query(
                `INSERT INTO ai_learning_context (source_type, source_id, content, level, metadata)
                 VALUES ('sample_transcripts', NULL, $1, $2, $3)
                 ON CONFLICT (source_type, source_id, content) DO NOTHING`,
                [
                  item.text,
                  estimatedLevel,
                  JSON.stringify({ topic: item.topic, word_count: words, source: 'sampleTranscripts' })
                ]
              );
            } catch (err) {
              // Ignore duplicate errors
              if (!err.message.includes('duplicate') && !err.message.includes('conflict')) {
                console.error("Error inserting sample transcript:", err);
              }
            }
          }
        }
        console.log(`âœ… Loaded ${sampleData.length} sample transcripts into learning context`);
      }
    } catch (err) {
      console.error("âŒ Error loading sampleTranscripts:", err);
    }
  } catch (err) {
    console.error("âŒ Error learning from sources:", err);
  }
}

// Danh sÃ¡ch topics phong phÃº tá»« nhiá»u nguá»“n
const TOPIC_THEMES = {
  1: [
    "Self-introduction", "Family", "Daily routine", "Food", "Colors", "Numbers", 
    "Weather", "Pets", "School", "Friends", "Hobbies", "Sports", "Shopping",
    "Transportation", "Home", "Clothing", "Body parts", "Time", "Days of week"
  ],
  2: [
    "Travel", "Work", "Education", "Music", "Movies", "Books", "Technology",
    "Health", "Culture", "Future plans", "Dreams", "Art", "Photography",
    "Cooking", "Fitness", "Relationships", "Career", "Language learning",
    "Entertainment", "Social media", "Environment", "Holidays", "Festivals"
  ],
  3: [
    "Artificial Intelligence", "Climate change", "Globalization", "Philosophy",
    "Psychology", "Economics", "Politics", "Science", "Research", "Innovation",
    "Sustainability", "Ethics", "Society", "History", "Literature", "Mathematics",
    "Physics", "Chemistry", "Biology", "Astronomy", "Cybersecurity", "Data science",
    "Machine learning", "AI ethics", "Public health", "Mental health", "Nutrition"
  ]
};

/**
 * Láº¥y topics vÃ  prompts Ä‘Ã£ dÃ¹ng trong session Ä‘á»ƒ trÃ¡nh láº·p láº¡i
 */
async function getUsedTopicsInSession(sessionId, level) {
  try {
    if (!sessionId) return { topics: [], prompts: [] };
    
    const usedRounds = await pool.query(
      `SELECT spr.prompt, agp.topic 
       FROM speaking_practice_rounds spr
       LEFT JOIN ai_generated_prompts agp ON spr.prompt = agp.prompt_text
       WHERE spr.session_id = $1
       ORDER BY spr.round_number DESC
       LIMIT 10`,
      [sessionId]
    );
    
    const topics = usedRounds.rows.map(r => r.topic).filter(Boolean);
    const prompts = usedRounds.rows.map(r => r.prompt).filter(Boolean);
    
    return { topics, prompts };
  } catch (err) {
    console.error("Error getting used topics:", err);
    return { topics: [], prompts: [] };
  }
}

/**
 * Gá»i Python continuous learning engine Ä‘á»ƒ phÃ¢n tÃ­ch vÃ  cÃ¡ nhÃ¢n hÃ³a
 */
async function getPersonalizationContext(learnerId, sessionId) {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    const backendDir = getProjectRoot();
    const enginePath = path.join(backendDir, "ai_models", "continuousLearningEngine.py");
    
    // Láº¥y dá»¯ liá»‡u session Ä‘á»ƒ phÃ¢n tÃ­ch
    const rounds = await pool.query(
      `SELECT score, prompt, time_taken, analysis 
       FROM speaking_practice_rounds 
       WHERE session_id = $1 AND score > 0
       ORDER BY round_number`,
      [sessionId]
    );
    
    if (rounds.rows.length === 0) {
      return null;
    }
    
    // Chuáº©n bá»‹ data cho continuous learning
    const sessionData = {
      scores: rounds.rows.map(r => parseFloat(r.score) || 0),
      topics: rounds.rows.map(r => {
        try {
          const analysis = typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis;
          return analysis?.topic || 'general';
        } catch {
          return 'general';
        }
      }),
      durations: rounds.rows.map(r => parseInt(r.time_taken) || 0),
      strengths: rounds.rows.map(r => {
        try {
          const analysis = typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis;
          return analysis?.strengths || [];
        } catch {
          return [];
        }
      }),
      improvements: rounds.rows.map(r => {
        try {
          const analysis = typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis;
          return analysis?.improvements || [];
        } catch {
          return [];
        }
      })
    };
    
    const sessionDataJson = JSON.stringify(sessionData).replace(/"/g, '\\"');
    const command = `python "${enginePath}" analyze ${learnerId} "${sessionDataJson}"`;
    
    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);
    
    // Láº¥y personalization context tá»« káº¿t quáº£
    const personalization = result.personalization_context || {};
    const analysis = result.analysis || {};
    
    // Táº¡o personalization context tá»« analysis
    return {
      recommended_level: analysis.adaptive_strategy?.recommended_level || personalization.recommended_level,
      preferred_topics: analysis.strength_areas?.top_strengths || personalization.preferred_topics || [],
      focus_areas: analysis.improvement_areas?.priority_improvements || personalization.focus_areas || [],
      learning_style: analysis.adaptive_strategy?.learning_style || personalization.learning_style || 'balanced',
      pace: analysis.adaptive_strategy?.pace_adjustment || personalization.pace || 'normal'
    };
  } catch (err) {
    console.error("âŒ Error getting personalization context:", err);
    return null;
  }
}

/**
 * Gá»i Python comprehensive trainer Ä‘á»ƒ táº¡o training data thÃ´ng minh
 */
async function getTrainingDataFromPython(trainingType, options = {}) {
  return new Promise(async (resolve) => {
    try {
      const { spawn } = await import("child_process");
      const backendDir = getProjectRoot();
      const trainerPath = path.join(backendDir, "ai_models", "comprehensiveAITrainer.py");
      
      // Táº¡o data object Ä‘á»ƒ gá»­i qua stdin
      let stdinData = { training_type: trainingType };
      
      if (trainingType === 'prompt_generator') {
        // Táº¡o topics tá»« TOPIC_THEMES constant (khÃ´ng cÃ²n báº£ng topics)
        const level = options.level || 2;
        const availableTopics = TOPIC_THEMES[level] || TOPIC_THEMES[2];
        const selectedTopics = availableTopics
          .sort(() => Math.random() - 0.5)
          .slice(0, 20)
          .map((title, index) => ({
            id: index + 1,
            title,
            description: `Topic: ${title}`,
            level
          }));
        
        const challenges = await pool.query(`SELECT id, title, description, level, type FROM challenges ORDER BY RANDOM() LIMIT 20`);
        
        const topicsJson = JSON.stringify(selectedTopics);
        const challengesJson = JSON.stringify(challenges.rows);
        
        // Láº¥y personalization context náº¿u cÃ³ learnerId
        let personalizationContext = null;
        if (options.learnerId && options.sessionId) {
          personalizationContext = await getPersonalizationContext(options.learnerId, options.sessionId);
        }
        
        stdinData = {
          training_type: 'prompt_generator',
          level: options.level || 2,
          used_topics: options.usedTopics || [],
          used_prompts: options.usedPrompts || [],
          topics_json: topicsJson,
          challenges_json: challengesJson,
          learner_id: options.learnerId || null,
          personalization_context: personalizationContext
        };
      } else if (trainingType === 'conversation_ai') {
        stdinData = {
          training_type: 'conversation_ai',
          topic: options.topic || null,
          history: options.history || []
        };
      } else if (trainingType === 'quick_analysis') {
        stdinData = {
          training_type: 'quick_analysis',
          transcript: options.transcript || "",
          expected: options.expected || null,
          level: options.level || 2
        };
      }
      
      // Spawn Python process vá»›i stdin vÃ  set UTF-8 encoding
      const pythonProcess = spawn('python', [trainerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        }
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error("âŒ Python trainer error:", stderr);
          resolve(null); // Return null Ä‘á»ƒ fallback
          return;
        }
        
        try {
          // Extract JSON tá»« stdout (bá» qua debug messages)
          const firstBrace = stdout.indexOf('{');
          const lastBrace = stdout.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonString = stdout.substring(firstBrace, lastBrace + 1);
            const result = JSON.parse(jsonString);
            resolve(result);
          } else {
            console.error("âŒ No JSON found in Python output");
            console.error("Python stdout:", stdout);
            resolve(null);
          }
        } catch (err) {
          console.error("âŒ Error parsing Python output:", err);
          console.error("Python stdout:", stdout);
          resolve(null); // Return null Ä‘á»ƒ fallback
        }
      });
      
      pythonProcess.on('error', (err) => {
        console.error("âŒ Error spawning Python process:", err);
        resolve(null); // Return null Ä‘á»ƒ fallback
      });
      
      // Gá»­i data qua stdin
      pythonProcess.stdin.write(JSON.stringify(stdinData));
      pythonProcess.stdin.end();
      
    } catch (err) {
      console.error("âŒ Error calling Python trainer:", err);
      resolve(null); // Return null Ä‘á»ƒ fallback
    }
  });
}

/**
 * Láº¥y Ä‘iá»ƒm trung bÃ¬nh cá»§a há»c viÃªn
 */
async function getLearnerAverageScore(learnerId) {
  if (!learnerId) return null;
  
  try {
    const result = await pool.query(
      `SELECT AVG(average_score) as avg_score
       FROM practice_history 
       WHERE learner_id = $1 
         AND practice_type = 'speaking_practice' 
         AND average_score IS NOT NULL`,
      [learnerId]
    );
    
    return result.rows[0]?.avg_score ? parseFloat(result.rows[0].avg_score) : null;
  } catch (err) {
    console.error("âŒ Error getting learner average score:", err);
    return null;
  }
}

/**
 * XÃ¡c Ä‘á»‹nh Ä‘á»™ khÃ³ cá»§a cÃ¢u dá»±a trÃªn Ä‘iá»ƒm trung bÃ¬nh vÃ  round number
 * PhÃ¢n bá»•: dá»…/trung bÃ¬nh/khÃ³ theo tá»‰ lá»‡ phÃ¹ há»£p vá»›i trÃ¬nh Ä‘á»™
 */
function determineDifficultyForRound(averageScore, roundNumber) {
  // Náº¿u khÃ´ng cÃ³ Ä‘iá»ƒm, dÃ¹ng tá»‰ lá»‡ máº·c Ä‘á»‹nh cho ngÆ°á»i má»›i
  if (!averageScore || averageScore === 0) {
    // Round 1-3: dá»…, Round 4-7: trung bÃ¬nh, Round 8-10: khÃ³
    if (roundNumber <= 3) return 'easy';
    if (roundNumber <= 7) return 'medium';
    return 'hard';
  }
  
  // PhÃ¢n bá»• dá»±a trÃªn Ä‘iá»ƒm trung bÃ¬nh
  let easyRatio, mediumRatio, hardRatio;
  
  if (averageScore < 50) {
    // Äiá»ƒm < 50: 70% dá»…, 25% trung bÃ¬nh, 5% khÃ³
    easyRatio = 0.7;
    mediumRatio = 0.25;
    hardRatio = 0.05;
  } else if (averageScore < 70) {
    // Äiá»ƒm 50-70: 40% dá»…, 45% trung bÃ¬nh, 15% khÃ³
    easyRatio = 0.4;
    mediumRatio = 0.45;
    hardRatio = 0.15;
  } else if (averageScore < 85) {
    // Äiá»ƒm 70-85: 20% dá»…, 50% trung bÃ¬nh, 30% khÃ³
    easyRatio = 0.2;
    mediumRatio = 0.5;
    hardRatio = 0.3;
  } else {
    // Äiá»ƒm > 85: 10% dá»…, 40% trung bÃ¬nh, 50% khÃ³
    easyRatio = 0.1;
    mediumRatio = 0.4;
    hardRatio = 0.5;
  }
  
  // XÃ¡c Ä‘á»‹nh Ä‘á»™ khÃ³ cho round nÃ y dá»±a trÃªn tá»‰ lá»‡
  const random = Math.random();
  if (random < easyRatio) {
    return 'easy';
  } else if (random < easyRatio + mediumRatio) {
    return 'medium';
  } else {
    return 'hard';
  }
}

/**
 * AI tá»± táº¡o prompt má»›i sá»­ dá»¥ng Python trainer (Ä‘Æ¡n giáº£n hÃ³a)
 * PhÃ¢n bá»• cÃ¢u dá»…/trung bÃ¬nh/khÃ³ dá»±a trÃªn Ä‘iá»ƒm trung bÃ¬nh cá»§a há»c viÃªn
 */
async function generateAIPrompt(level, roundNumber, learnerId = null, sessionId = null) {
  try {
    // Láº¥y Ä‘iá»ƒm trung bÃ¬nh cá»§a há»c viÃªn
    const averageScore = await getLearnerAverageScore(learnerId);
    
    // XÃ¡c Ä‘á»‹nh Ä‘á»™ khÃ³ cho round nÃ y
    const difficulty = determineDifficultyForRound(averageScore, roundNumber);
    
    console.log(`ðŸ“Š Learner average score: ${averageScore || 'N/A'}, Round ${roundNumber}, Difficulty: ${difficulty}`);
    
    // Láº¥y topics vÃ  prompts Ä‘Ã£ dÃ¹ng trong session Ä‘á»ƒ trÃ¡nh láº·p láº¡i
    const { topics: usedTopics, prompts: usedPrompts } = await getUsedTopicsInSession(sessionId, level);
    
    // Láº¥y personalization context tá»« continuous learning engine
    let personalizationContext = null;
    if (learnerId && sessionId) {
      personalizationContext = await getPersonalizationContext(learnerId, sessionId);
    }
    
    // Táº¡o topics tá»« TOPIC_THEMES constant (khÃ´ng cÃ²n báº£ng topics)
    const availableTopics = TOPIC_THEMES[level] || TOPIC_THEMES[2];
    const selectedTopics = availableTopics
      .sort(() => Math.random() - 0.5)
      .slice(0, 20)
      .map((title, index) => ({
        id: index + 1,
        title,
        description: `Topic: ${title}`,
        level
      }));
    
    const challenges = await pool.query(`SELECT id, title, description, level, type FROM challenges ORDER BY RANDOM() LIMIT 20`);
    
    // Gá»i OpenRouter vá»›i training data tá»« Python qua trainedAIService
    // trainedAIService sáº½ tá»± Ä‘á»™ng gá»i Python trainer vá»›i topics/challenges
    // QUAN TRá»ŒNG: Äá»™ khÃ³ Ä‘Æ°á»£c xÃ¡c Ä‘á»‹nh dá»±a trÃªn Ä‘iá»ƒm trung bÃ¬nh cá»§a há»c viÃªn
    const response = await aiServiceClient.callTrainedAI(
      'prompt_generator',
      {
        level,
        usedTopics,
        usedPrompts,
        learnerId,
        sessionId,
        topicsJson: JSON.stringify(selectedTopics),
        challengesJson: JSON.stringify(challenges.rows),
        personalizationContext,
        // Äá»™ khÃ³ Ä‘Æ°á»£c xÃ¡c Ä‘á»‹nh dá»±a trÃªn Ä‘iá»ƒm trung bÃ¬nh
        difficulty_requirement: difficulty === 'hard' ? 'very_hard' : difficulty === 'medium' ? 'medium' : 'easy',
        average_score: averageScore // Truyá»n Ä‘iá»ƒm trung bÃ¬nh Ä‘á»ƒ AI cÃ³ thá»ƒ Ä‘iá»u chá»‰nh
      },
      null, // Messages sáº½ Ä‘Æ°á»£c táº¡o tá»± Ä‘á»™ng vá»›i randomization
      { 
        model: 'openai/gpt-4o-mini', 
        temperature: difficulty === 'hard' ? 1.2 : difficulty === 'medium' ? 1.1 : 1.0,
        max_tokens: difficulty === 'hard' ? 300 : difficulty === 'medium' ? 250 : 200
      }
    );
    
    // Náº¿u response fail, fallback
    if (!response || !response.choices || !response.choices[0]) {
      console.warn("âš ï¸ AI response failed, using fallback");
      return await generateAIPromptFallback(level, usedTopics, usedPrompts, difficulty);
    }

    const content = response.choices?.[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      // Náº¿u khÃ´ng pháº£i JSON, extract
      const promptMatch = content.match(/"suggested_prompt":\s*"([^"]+)"/);
      const topicMatch = content.match(/"topic":\s*"([^"]+)"/);
      result = {
        topic: topicMatch ? topicMatch[1] : usedTopics[0] || "general",
        suggested_prompt: promptMatch ? promptMatch[1] : content.trim().replace(/^["']|["']$/g, ""),
        description: ""
      };
    }

    // Sá»­ dá»¥ng suggested_prompt hoáº·c táº¡o prompt tá»« topic
    const finalPrompt = result.suggested_prompt || result.prompt || 
      `Let's talk about ${result.topic || 'something interesting'}.`;

    if (!finalPrompt) {
      throw new Error("Failed to generate prompt");
    }

    // LÆ°u prompt Ä‘Ã£ generate vÃ o database
    const wordCount = finalPrompt.split(/\s+/).length;
    // TÃ­nh difficulty_score dá»±a trÃªn Ä‘á»™ khÃ³ thá»±c táº¿
    const difficultyScore = difficulty === 'hard' ? 0.9 : difficulty === 'medium' ? 0.6 : 0.3;

    await pool.query(
      `INSERT INTO ai_generated_prompts 
       (level, prompt_text, topic, word_count, difficulty_score, usage_count)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (prompt_text) DO UPDATE 
       SET usage_count = ai_generated_prompts.usage_count + 1, 
           last_used_at = NOW(),
           updated_at = NOW()`,
      [
        level,
        finalPrompt,
        result.topic || "general",
        wordCount,
        difficultyScore
      ]
    );

    return finalPrompt;
  } catch (err) {
    console.error("âŒ Error generating AI prompt:", err);
    
    // Fallback: Láº¥y láº¡i difficulty vÃ  averageScore Ä‘á»ƒ táº¡o prompt phÃ¹ há»£p
    try {
      const averageScore = await getLearnerAverageScore(learnerId);
      const difficulty = determineDifficultyForRound(averageScore, roundNumber);
      
      // Fallback: Generate simple prompt with AI dá»±a trÃªn difficulty
      const difficultyDesc = difficulty === 'hard' ? 'difficult (30-50 words, complex vocabulary)' : 
                             difficulty === 'medium' ? 'medium (15-30 words, moderate vocabulary)' : 
                             'easy (5-15 words, simple vocabulary)';
      
      const fallbackPrompt = `Generate a ${difficultyDesc} English speaking practice sentence. Return only the sentence, no explanation.`;
      
      const response = await aiServiceClient.callOpenRouter(
        [{ role: "user", content: fallbackPrompt }],
        { model: "openai/gpt-4o-mini", temperature: 1.0, max_tokens: 100 }
      );
      const content = response.choices?.[0]?.message?.content || "";
      return content.trim().replace(/^["']|["']$/g, "") || 
        (difficulty === 'hard' ? "The advancement of technology has significantly transformed how we learn and interact with information in the modern world." :
         difficulty === 'medium' ? "I enjoy learning English because it helps me communicate with people from different countries." :
         "Hello, my name is Anna. I am from Vietnam.");
    } catch (fallbackErr) {
      // Ultimate fallback: Táº¡o prompt ngáº«u nhiÃªn tá»« topics
      try {
        const averageScore = await getLearnerAverageScore(learnerId);
        const difficulty = determineDifficultyForRound(averageScore, roundNumber);
        const { topics: usedTopics } = await getUsedTopicsInSession(sessionId, level);
        
        // Táº¡o prompt ngáº«u nhiÃªn tá»« topics
        return await generateAIPromptFallback(level, usedTopics, [], difficulty);
      } catch (fallbackErr) {
        console.error("âŒ Ultimate fallback failed:", fallbackErr);
        // Last resort: prompt Ä‘Æ¡n giáº£n nháº¥t
        const lastResort = {
          easy: "Hello, my name is Anna. I am from Vietnam.",
          medium: "I enjoy learning English because it helps me communicate with people from different countries.",
          hard: "The advancement of technology has significantly transformed how we learn and interact with information in the modern world."
        };
        return lastResort.easy;
      }
    }
  }
}

/**
 * Fallback method náº¿u Python trainer khÃ´ng hoáº¡t Ä‘á»™ng (Ä‘Æ¡n giáº£n hÃ³a)
 */
async function generateAIPromptFallback(level, usedTopics = [], usedPrompts = [], difficulty = 'easy') {
  // ÄÆ¡n giáº£n hÃ³a: chá»‰ táº¡o prompt ngáº¯n gá»n vá»›i AI
  const availableTopics = TOPIC_THEMES[level] || TOPIC_THEMES[1];
  const unusedTopics = availableTopics.filter(t => !usedTopics.includes(t));
  const selectedTopics = unusedTopics.length > 0 
    ? unusedTopics.sort(() => Math.random() - 0.5).slice(0, 3)
    : availableTopics.sort(() => Math.random() - 0.5).slice(0, 3);
  
  // XÃ¡c Ä‘á»‹nh Ä‘á»™ dÃ i dá»±a trÃªn difficulty thay vÃ¬ level
  const lengthDesc = difficulty === 'hard' ? '30-50' : difficulty === 'medium' ? '15-30' : '5-15';
  
  const simplePrompt = `Generate a NEW speaking practice sentence for ${difficulty} difficulty English learners.
- Length: ${lengthDesc} words
- Topic: ${selectedTopics.join(' or ')}
- Avoid: ${usedPrompts.slice(0, 3).join(', ') || 'none'}
- Natural, conversational English

Return JSON: {"prompt": "sentence", "topic": "topic name", "word_count": number}`;

  try {
    const response = await aiServiceClient.callOpenRouter(
      [{ role: "user", content: simplePrompt }],
      { model: "openai/gpt-4o-mini", temperature: 0.95, max_tokens: 200 }
    );

    const content = response.choices?.[0]?.message?.content || "{}";
    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      result = {
        prompt: content.trim().replace(/^["']|["']$/g, ""),
        topic: selectedTopics[0] || "general",
        word_count: content.split(/\s+/).length
      };
    }

    // Náº¿u cÃ³ prompt há»£p lá»‡, tráº£ vá»
    if (result.prompt && result.prompt.length > 10) {
      return result.prompt;
    }
  } catch (err) {
    console.warn("âš ï¸ Fallback AI call failed, using topic-based prompts:", err.message);
  }

  // Náº¿u váº«n fail, táº¡o prompt ngáº«u nhiÃªn tá»« topics thay vÃ¬ dÃ¹ng prompt cá»‘ Ä‘á»‹nh
  const randomTopic = selectedTopics[Math.floor(Math.random() * selectedTopics.length)] || selectedTopics[0] || "general";
  
  // Táº¡o prompt Ä‘a dáº¡ng dá»±a trÃªn topic vÃ  difficulty
  const topicBasedPrompts = {
    easy: [
      `Hello, my name is ${randomTopic === 'Self-introduction' ? 'Anna' : 'John'}. I am from Vietnam.`,
      `I like ${randomTopic.toLowerCase()}. It is fun.`,
      `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}. I feel happy.`,
      `My favorite ${randomTopic.toLowerCase()} is ${randomTopic === 'Colors' ? 'blue' : randomTopic === 'Food' ? 'pizza' : 'good'}.`,
      `I have a ${randomTopic === 'Pets' ? 'dog' : randomTopic === 'Family' ? 'sister' : 'friend'}.`
    ],
    medium: [
      `I enjoy ${randomTopic.toLowerCase()} because it helps me learn new things and meet interesting people.`,
      `Last weekend, I went to a ${randomTopic.toLowerCase()} event and had a wonderful time with my friends.`,
      `In my opinion, ${randomTopic.toLowerCase()} is very important for personal development and growth.`,
      `I have been interested in ${randomTopic.toLowerCase()} since I was young, and it has become my passion.`,
      `When I think about ${randomTopic.toLowerCase()}, I feel excited and motivated to explore more.`
    ],
    hard: [
      `The advancement of ${randomTopic.toLowerCase()} has significantly transformed how we learn and interact with information in the modern world.`,
      `In today's globalized society, understanding ${randomTopic.toLowerCase()} is crucial for effective communication and cultural exchange.`,
      `Research in ${randomTopic.toLowerCase()} has revealed fascinating insights into human behavior and cognitive processes.`,
      `The intersection of ${randomTopic.toLowerCase()} and technology has created unprecedented opportunities for innovation and discovery.`,
      `Critical analysis of ${randomTopic.toLowerCase()} requires a deep understanding of historical context and contemporary perspectives.`
    ]
  };
  
  const prompts = topicBasedPrompts[difficulty] || topicBasedPrompts.easy;
  const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
  
  return randomPrompt;
}

/**
 * Láº¥y prompt cho vÃ²ng nÃ³i (Æ°u tiÃªn AI-generated, Ä‘a dáº¡ng hÃ³a)
 * QUAN TRá»ŒNG: LuÃ´n táº¡o prompt Má»šI, khÃ´ng reuse prompts Ä‘Ã£ dÃ¹ng trong session
 */
export async function getPromptForRound(level, roundNumber, learnerId = null, sessionId = null) {
  try {
    console.log(`ðŸŽ¯ getPromptForRound called: level=${level}, round=${roundNumber}, sessionId=${sessionId}`);
    
    // Láº¥y topics vÃ  prompts Ä‘Ã£ dÃ¹ng trong session
    const { topics: usedTopics, prompts: usedPrompts } = await getUsedTopicsInSession(sessionId, level);
    console.log(`ðŸ“‹ Used in session: ${usedPrompts.length} prompts, ${usedTopics.length} topics`);
    
    // QUAN TRá»ŒNG: LuÃ´n generate prompt Má»šI thay vÃ¬ láº¥y tá»« database
    // Äiá»u nÃ y Ä‘áº£m báº£o má»—i round cÃ³ prompt khÃ¡c nhau
    console.log(`ðŸ”„ Generating NEW prompt for round ${roundNumber}...`);
    const newPrompt = await generateAIPrompt(level, roundNumber, learnerId, sessionId);
    
    // Kiá»ƒm tra xem prompt má»›i cÃ³ trÃ¹ng vá»›i prompts Ä‘Ã£ dÃ¹ng khÃ´ng
    if (usedPrompts.includes(newPrompt)) {
      console.warn(`âš ï¸ Generated prompt matches used prompt, generating again...`);
      // Generate láº¡i náº¿u trÃ¹ng
      const retryPrompt = await generateAIPrompt(level, roundNumber, learnerId, sessionId);
      return retryPrompt;
    }
    
    console.log(`âœ… Generated new prompt: "${newPrompt.substring(0, 50)}..."`);
    return newPrompt;
    
    /* OLD LOGIC - Commented out Ä‘á»ƒ luÃ´n generate má»›i
    // Thá»­ láº¥y tá»« AI-generated prompts vá»›i Æ°u tiÃªn topics chÆ°a dÃ¹ng vÃ  prompts chÆ°a dÃ¹ng
    let aiPrompt;
    if (usedPrompts.length > 0) {
      // Náº¿u cÃ³ prompts Ä‘Ã£ dÃ¹ng, loáº¡i bá» chÃºng
      aiPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         AND prompt_text NOT IN (${usedPrompts.map((_, i) => `$${i + 2}`).join(", ")})
         ${usedTopics.length > 0 
           ? `AND (topic NOT IN (${usedTopics.map((_, i) => `$${usedPrompts.length + i + 2}`).join(", ")}) OR topic IS NULL)`
           : ""}
         ORDER BY 
           ${usedTopics.length > 0 
             ? `CASE WHEN topic NOT IN (${usedTopics.map((_, i) => `$${usedPrompts.length + i + 2}`).join(", ")}) THEN 0 ELSE 1 END, `
             : ""}
           usage_count ASC, 
           RANDOM()
         LIMIT 1`,
        [level, ...usedPrompts, ...usedTopics]
      );
    } else if (usedTopics.length > 0) {
      // Chá»‰ cÃ³ topics Ä‘Ã£ dÃ¹ng
      aiPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         AND (topic NOT IN (${usedTopics.map((_, i) => `$${i + 2}`).join(", ")}) OR topic IS NULL)
         ORDER BY 
           CASE WHEN topic NOT IN (${usedTopics.map((_, i) => `$${i + 2}`).join(", ")}) THEN 0 ELSE 1 END,
           usage_count ASC, 
           RANDOM()
         LIMIT 1`,
        [level, ...usedTopics]
      );
    } else {
      // ChÆ°a cÃ³ gÃ¬ Ä‘Æ°á»£c dÃ¹ng
      aiPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         ORDER BY usage_count ASC, RANDOM()
         LIMIT 1`,
        [level]
      );
    }

    // Náº¿u khÃ´ng tÃ¬m tháº¥y prompt vá»›i topic má»›i, tÃ¬m báº¥t ká»³
    let selectedPrompt = aiPrompt.rows[0];
    if (!selectedPrompt) {
      const anyPrompt = await pool.query(
        `SELECT prompt_text, topic FROM ai_generated_prompts 
         WHERE level = $1 
         ORDER BY usage_count ASC, RANDOM() 
         LIMIT 1`,
        [level]
      );
      selectedPrompt = anyPrompt.rows[0];
    }

    if (selectedPrompt) {
      // Update usage
      await pool.query(
        `UPDATE ai_generated_prompts 
         SET usage_count = usage_count + 1, last_used_at = NOW()
         WHERE prompt_text = $1`,
        [selectedPrompt.prompt_text]
      );
      return selectedPrompt.prompt_text;
    }

    // Náº¿u chÆ°a cÃ³, generate má»›i vá»›i Ä‘a dáº¡ng hÃ³a
    return await generateAIPrompt(level, roundNumber, learnerId, sessionId);
    */
  } catch (err) {
    console.error("âŒ Error getting prompt:", err);
    // Fallback cuá»‘i cÃ¹ng: táº¡o prompt Ä‘Æ¡n giáº£n vá»›i AI trá»±c tiáº¿p
    try {
      const fallbackPrompt = `Generate a simple English speaking practice sentence for level ${level} learners. Return only the sentence, no explanation.`;
      const response = await aiServiceClient.callOpenRouter(
        [{ role: "user", content: fallbackPrompt }],
        { model: "openai/gpt-4o-mini", temperature: 1.0, max_tokens: 100 }
      );
      const content = response.choices?.[0]?.message?.content || "";
      return content.trim().replace(/^["']|["']$/g, "") || `Let's practice speaking English. This is level ${level}.`;
    } catch (fallbackErr) {
      console.error("âŒ Fallback prompt generation failed:", fallbackErr);
      // Ultimate fallback - simple prompts
      const ultimateFallback = {
        1: "Hello, my name is Anna. I am from Vietnam.",
        2: "I enjoy learning English because it helps me communicate with people from different countries.",
        3: "The advancement of technology has significantly transformed how we learn and interact with information in the modern world."
      };
      return ultimateFallback[level] || ultimateFallback[1];
    }
  }
}

/**
 * Láº¥y time limit cho level vÃ  prompt
 */
export function getTimeLimit(level, prompt = "") {
  return calculateTimeLimit(prompt, level);
}

/**
 * LÆ°u vÃ²ng nÃ³i (lÆ°u ngay, xá»­ lÃ½ á»Ÿ background)
 */
export async function saveRound(sessionId, roundNumber, audioUrl, timeTaken, promptText = null) {
  const session = await pool.query(
    `SELECT level, learner_id FROM speaking_practice_sessions WHERE id = $1`,
    [sessionId]
  );

  if (!session.rows[0]) {
    throw new Error("Session not found");
  }

  const level = session.rows[0].level;
  const learnerId = session.rows[0].learner_id;
  
  // QUAN TRá»ŒNG: Náº¿u promptText Ä‘Æ°á»£c truyá»n tá»« frontend, dÃ¹ng nÃ³. Náº¿u khÃ´ng, fetch má»›i
  let prompt = promptText;
  if (!prompt) {
    // Fetch prompt má»›i vá»›i sessionId Ä‘á»ƒ track used prompts
    prompt = await getPromptForRound(level, roundNumber, learnerId, sessionId);
  }

  // LÆ°u vÃ o database ngay (chÆ°a cÃ³ transcript vÃ  analysis)
  const result = await pool.query(
    `INSERT INTO speaking_practice_rounds 
     (session_id, round_number, prompt, audio_url, transcript, time_taken, score, analysis)
     VALUES ($1, $2, $3, $4, NULL, $5, 0, NULL)
     RETURNING *`,
    [
      sessionId,
      roundNumber,
      prompt,
      audioUrl,
      timeTaken
    ]
  );

  const roundId = result.rows[0].id;

  // QUAN TRá»ŒNG: PhÃ¢n tÃ­ch ngay sau má»—i vÃ²ng (khÃ´ng Ä‘á»£i Ä‘áº¿n cuá»‘i)
  // Xá»­ lÃ½ ngay trong background Ä‘á»ƒ káº¿t quáº£ sáºµn sÃ ng khi Ä‘áº¿n summary
  try {
    const { enqueue } = await import("../utils/queue.js");
    // Enqueue vá»›i priority cao Ä‘á»ƒ xá»­ lÃ½ nhanh
    await enqueue("processSpeakingRound", {
      roundId,
      sessionId,
      audioUrl,
      prompt,
      level,
      time_taken: timeTaken
    }, {
      priority: 1, // Priority cao Ä‘á»ƒ xá»­ lÃ½ ngay
      attempts: 2 // Retry náº¿u fail
    });
  } catch (err) {
    console.error("âŒ Error enqueueing processing job:", err);
    // Náº¿u khÃ´ng cÃ³ queue, xá»­ lÃ½ ngay (fallback) - khÃ´ng Ä‘á»£i
    processRoundInBackground(roundId, audioUrl, prompt, level, sessionId).catch(err => {
      console.error("âŒ Background processing error:", err);
    });
  }

  return result.rows[0];
}

/**
 * Xá»­ lÃ½ round á»Ÿ background (transcription + AI analysis)
 * QUAN TRá»ŒNG: PhÃ¢n tÃ­ch ngay sau má»—i vÃ²ng Ä‘á»ƒ káº¿t quáº£ sáºµn sÃ ng khi Ä‘áº¿n summary
 */
async function processRoundInBackground(roundId, audioUrl, prompt, level, sessionId = null) {
  const localPath = audioUrl.startsWith("/uploads/")
    ? path.join(getProjectRoot(), audioUrl)
    : audioUrl;

  let transcript = null;
  let transcriptionError = null;
  if (fs.existsSync(localPath)) {
    try {
      const { json: transcriptJson } = await runWhisperX(localPath, {
        model: "base"
        // computeType khÃ´ng cáº§n chá»‰ Ä‘á»‹nh - tá»± Ä‘á»™ng dÃ¹ng GPU vá»›i float16
      });
      transcript = transcriptJson;
    } catch (err) {
      console.error("âŒ Transcription error:", err);
      const errMsg = err.message || String(err);
      
      // Kiá»ƒm tra náº¿u lÃ  lá»—i torchvision compatibility
      if (errMsg.includes("torchvision") || errMsg.includes("nms") || errMsg.includes("extension")) {
        transcriptionError = `Lá»—i tÆ°Æ¡ng thÃ­ch torchvision/torch. Vui lÃ²ng cháº¡y script fix: python backend/scripts/fix_torchvision.py. Chi tiáº¿t: ${errMsg}`;
        console.error("ðŸ’¡ To fix torchvision error, run: python backend/scripts/fix_torchvision.py");
      } else {
        transcriptionError = errMsg;
      }
      // KhÃ´ng return ngay - tiáº¿p tá»¥c Ä‘á»ƒ cáº­p nháº­t database vá»›i lá»—i
    }
  }

  // Analyze vá»›i AI
  let analysis = null;
  let score = 0;
  let feedback = "";
  let errors = [];
  let correctedText = "";

  // Náº¿u cÃ³ lá»—i transcription, cáº­p nháº­t database vá»›i thÃ´ng bÃ¡o lá»—i
  if (transcriptionError) {
    feedback = `Lá»—i phÃ¢n tÃ­ch Ã¢m thanh: ${transcriptionError}. Vui lÃ²ng thá»­ láº¡i hoáº·c kiá»ƒm tra file audio.`;
    score = 0;
    analysis = {
      score: 0,
      feedback: feedback,
      missing_words: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 0),
      errors: [{ type: "transcription_error", message: transcriptionError }],
      corrected_text: prompt
    };
  } else if (transcript) {
    const transcriptText =
      transcript.text ||
      (transcript.segments || [])
        .map((s) => s.text || "")
        .join(" ");
    
    // Kiá»ƒm tra náº¿u transcriptText rá»—ng
    if (!transcriptText || !transcriptText.trim()) {
      console.warn(`âš ï¸ Empty transcript text for round ${roundId}`);
      score = 0;
      feedback = "KhÃ´ng thá»ƒ nháº­n diá»‡n Ä‘Æ°á»£c lá»i nÃ³i. Vui lÃ²ng nÃ³i to vÃ  rÃµ rÃ ng hÆ¡n.";
      analysis = {
        score: 0,
        feedback: feedback,
        missing_words: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 0),
        errors: [],
        corrected_text: prompt
      };
    } else {

    try {
      // Láº¥y learner_id tá»« session Ä‘á»ƒ lÆ°u vÃ o quick_evaluations
      const sessionInfo = await pool.query(
        `SELECT learner_id FROM speaking_practice_sessions WHERE id = $1`,
        [sessionId]
      );
      const learnerId = sessionInfo.rows[0]?.learner_id;
      
      console.log(`ðŸ“Š Analyzing: transcript="${transcriptText.substring(0, 50)}...", prompt="${prompt.substring(0, 50)}..."`);
      analysis = await analyzePronunciation(transcriptText, prompt, level, roundId, sessionId, learnerId);
      score = Math.round(analysis.score || 0); // LÃ m trÃ²n Ä‘iá»ƒm
      feedback = analysis.feedback || "";
      errors = analysis.errors || [];
      correctedText = analysis.corrected_text || "";
      
      console.log(`âœ… Analysis result for round ${roundId}: score=${score}, missing_words=${analysis?.missing_words?.length || 0}`);
      
    } catch (err) {
      console.error("âŒ AI analysis error:", err);
      console.error("âŒ Error stack:", err.stack);
      feedback = "KhÃ´ng thá»ƒ phÃ¢n tÃ­ch. Vui lÃ²ng thá»­ láº¡i.";
      score = 0; // Náº¿u lá»—i, score = 0
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
    // Náº¿u khÃ´ng cÃ³ transcript (khÃ´ng nÃ³i gÃ¬), score = 0
    score = 0;
    feedback = "Báº¡n chÆ°a nÃ³i gÃ¬. HÃ£y thá»­ láº¡i vÃ  nÃ³i to, rÃµ rÃ ng.";
    analysis = {
      score: 0,
      feedback: feedback,
      missing_words: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 0),
      errors: [],
      corrected_text: prompt
    };
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
          missing_words: analysis?.missing_words || [],
          word_analysis: wordAnalysis.length > 0 ? wordAnalysis : [],
          transcription_error: transcriptionError || null
        }),
        roundId
      ]
    );
    console.log(`âœ… Updated round ${roundId} with score ${score}`);
  } catch (dbErr) {
    console.error(`âŒ Database update error for round ${roundId}:`, dbErr);
    // KhÃ´ng throw - Ä‘Ã£ log lá»—i
  }
}

/**
 * PhÃ¢n tÃ­ch phÃ¡t Ã¢m vá»›i AI sá»­ dá»¥ng Python trainer (quick analysis)
 */
async function analyzePronunciation(transcript, expectedText, level, roundId = null, sessionId = null, learnerId = null) {
  // QUAN TRá»ŒNG: Kiá»ƒm tra náº¿u khÃ´ng nÃ³i gÃ¬ (transcript rá»—ng hoáº·c khÃ´ng cÃ³ tá»« nÃ o) thÃ¬ score = 0
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
  
  // Kiá»ƒm tra xem cÃ³ tá»« nÃ o trong transcript match vá»›i expected text khÃ´ng
  const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const expectedWords = expectedText.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  console.log(`ðŸ” Word matching: expected="${expectedText.substring(0, 60)}..." (${expectedWords.length} words)`);
  console.log(`ðŸ” Transcript: "${transcript.substring(0, 60)}..." (${transcriptWords.length} words)`);
  
  // Náº¿u khÃ´ng cÃ³ tá»« nÃ o match, score = 0
  // Logic: Má»™t tá»« Ä‘Æ°á»£c coi lÃ  "Ä‘Ãºng" náº¿u:
  // 1. Exact match (sau khi loáº¡i bá» dáº¥u cÃ¢u)
  // 2. Transcript word chá»©a expected word (cho phÃ©p nÃ³i thÃªm)
  // 3. Expected word chá»©a transcript word (cho phÃ©p nÃ³i ngáº¯n gá»n)
  const matchedWords = expectedWords.filter(ew => {
    const cleanExpected = ew.replace(/[.,!?;:]/g, "").trim();
    if (!cleanExpected) return false;
    
    return transcriptWords.some(tw => {
      const cleanTranscript = tw.replace(/[.,!?;:]/g, "").trim();
      if (!cleanTranscript) return false;
      
      // Exact match
      if (cleanTranscript === cleanExpected) return true;
      
      // Partial match: transcript chá»©a expected (cho phÃ©p nÃ³i thÃªm)
      if (cleanTranscript.length >= cleanExpected.length && cleanTranscript.includes(cleanExpected)) return true;
      
      // Partial match: expected chá»©a transcript (cho phÃ©p nÃ³i ngáº¯n gá»n, nhÆ°ng pháº£i >= 3 kÃ½ tá»±)
      if (cleanExpected.length >= cleanTranscript.length && cleanExpected.includes(cleanTranscript) && cleanTranscript.length >= 3) return true;
      
      return false;
    });
  });
  
  console.log(`âœ… Matched words: ${matchedWords.length}/${expectedWords.length} = ${Math.round((matchedWords.length / expectedWords.length) * 100)}%`);
  if (matchedWords.length < expectedWords.length) {
    const missing = expectedWords.filter(ew => !matchedWords.includes(ew));
    console.log(`âš ï¸ Missing words:`, missing.slice(0, 10));
  }
  
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
  
  // TÃ­nh score dá»±a trÃªn tá»· lá»‡ tá»« match (0-10 Ä‘iá»ƒm)
  const matchRatio = matchedWords.length / expectedWords.length;
  const score = Math.round(matchRatio * 10); // 0-10 Ä‘iá»ƒm
  
  console.log(`ðŸ“Š Score calculation: ${matchedWords.length}/${expectedWords.length} = ${matchRatio.toFixed(2)} â†’ ${score}/10`);
  
  // Táº¡o feedback dá»±a trÃªn score
  let feedback = "";
  if (score >= 9) {
    feedback = "Xuáº¥t sáº¯c! Báº¡n Ä‘Ã£ nÃ³i ráº¥t chÃ­nh xÃ¡c vÃ  rÃµ rÃ ng.";
  } else if (score >= 7) {
    feedback = "Tá»‘t! Báº¡n Ä‘Ã£ nÃ³i Ä‘Ãºng háº§u háº¿t ná»™i dung. Tiáº¿p tá»¥c luyá»‡n táº­p!";
  } else if (score >= 5) {
    feedback = "KhÃ¡! Báº¡n Ä‘Ã£ nÃ³i Ä‘Æ°á»£c má»™t pháº§n ná»™i dung. HÃ£y cá»‘ gáº¯ng nÃ³i rÃµ rÃ ng hÆ¡n.";
  } else if (score >= 3) {
    feedback = "Cáº§n cáº£i thiá»‡n. HÃ£y nghe ká»¹ prompt vÃ  nÃ³i theo Ä‘Ãºng ná»™i dung.";
  } else {
    feedback = "Báº¡n chÆ°a nÃ³i Ä‘Ãºng nhiá»u tá»«. HÃ£y thá»­ láº¡i vÃ  nÃ³i to, rÃµ rÃ ng.";
  }
  
  return {
    score: score,
    feedback: feedback,
    errors: [],
    corrected_text: expectedText,
    missing_words: expectedWords.filter(ew => !matchedWords.includes(ew)),
    strengths: score >= 5 ? ["Ná»— lá»±c tá»‘t", "Tiáº¿p tá»¥c luyá»‡n táº­p"] : [],
    improvements: score < 5 ? ["HÃ£y nÃ³i to vÃ  rÃµ rÃ ng hÆ¡n", "Nghe ká»¹ prompt trÆ°á»›c khi nÃ³i"] : ["Tiáº¿p tá»¥c cáº£i thiá»‡n phÃ¡t Ã¢m"]
  };
}
    rounds: roundsWithMissingWords
  };
}


