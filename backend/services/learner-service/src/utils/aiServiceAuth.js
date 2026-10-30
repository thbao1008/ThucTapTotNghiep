export function getAIServiceAuthHeaders() {
  const token = process.env.AESP_LEARNER_SERVICE_TOKEN;
  if (typeof token !== "string" || Buffer.byteLength(token, "utf8") < 32) {
    const error = new Error("AESP_LEARNER_SERVICE_TOKEN must be configured with at least 32 bytes");
    error.code = "AI_SERVICE_AUTH_CONFIG";
    throw error;
  }
  return {
    "x-aesp-service": "learner",
    "x-aesp-service-token": token
  };
}
