// Script to test API endpoints and database connectivity
import axios from "axios";

const BASE_URL = process.env.API_URL || "http://localhost:4000";

async function testEndpoints() {
  console.log("🧪 Testing API Endpoints...\n");
  console.log(`Base URL: ${BASE_URL}\n`);

  let adminToken = null;
  let learnerToken = null;

  const tests = [
    {
      name: "Health Check",
      method: "GET",
      url: `${BASE_URL}/health`,
      expectedStatus: 200
    },
    {
      name: "Get Packages (Public)",
      method: "GET",
      url: `${BASE_URL}/api/packages/public`,
      expectedStatus: 200
    },
    {
      name: "Login (Admin)",
      method: "POST",
      url: `${BASE_URL}/api/auth/login`,
      data: {
        identifier: "admin@gmail.com",
        password: "aesp"
      },
      expectedStatus: 200,
      onSuccess: (response) => {
        adminToken = response.data.token;
      }
    },
    {
      name: "Login (Learner)",
      method: "POST",
      url: `${BASE_URL}/api/auth/login`,
      data: {
        identifier: "hoangthaohoa1@example.com",
        password: "123456"
      },
      expectedStatus: 200,
      onSuccess: (response) => {
        learnerToken = response.data.token;
      }
    },
    {
      name: "Admin Access Admin Route",
      method: "GET",
      url: `${BASE_URL}/api/admin/users`,
      expectedStatus: 200,
      headers: () => ({
        Authorization: `Bearer ${adminToken}`
      })
    },
    {
      name: "AI Service Health",
      method: "GET",
      url: `${BASE_URL}/api/ai/aiesp/status`,
      expectedStatus: 200,
      headers: () => ({
        Authorization: `Bearer ${adminToken}`
      })
    },
    {
      name: "AI Assistant Conversation",
      method: "POST",
      url: `${BASE_URL}/api/ai/assistant/conversation`,
      data: {
        message: "Hello, can you help me with English learning?"
      },
      expectedStatus: 200,
      headers: () => ({
        Authorization: `Bearer ${learnerToken}`
      })
    },
    {
      name: "AI Auto Topics Detection",
      method: "POST",
      url: `${BASE_URL}/api/ai/auto-topics`,
      data: {
        text: "I want to learn about technology and programming"
      },
      expectedStatus: 200,
      headers: () => ({
        Authorization: `Bearer ${adminToken}`
      })
    }
  ];

  for (const test of tests) {
    try {
      console.log(`📋 Testing: ${test.name}`);
      
      const config = {
        method: test.method,
        url: test.url,
        timeout: 5000
      };
      
      if (test.data) {
        config.data = test.data;
        config.headers = { "Content-Type": "application/json", ...config.headers };
      }

      if (test.headers) {
        config.headers = { ...config.headers, ...(typeof test.headers === 'function' ? test.headers() : test.headers) };
      }

      const response = await axios(config);
      
      if (response.status === test.expectedStatus) {
        console.log(`  ✅ Status: ${response.status} (Expected: ${test.expectedStatus})`);
        if (test.name === "Get Packages") {
          console.log(`  📦 Packages: ${response.data?.length || 0} items`);
        }
        if (test.name === "Login") {
          console.log(`  🔐 Token: ${response.data?.token ? "Received" : "Missing"}`);
          console.log(`  👤 User: ${response.data?.user?.email || "N/A"}`);
        }
        if (test.onSuccess) {
          test.onSuccess(response);
        }
      } else {
        console.log(`  ⚠️  Status: ${response.status} (Expected: ${test.expectedStatus})`);
      }
    } catch (err) {
      if (err.response) {
        console.log(`  ❌ Status: ${err.response.status}`);
        console.log(`  📝 Message: ${err.response.data?.message || err.response.data?.error || "Unknown error"}`);
      } else if (err.request) {
        console.log(`  ❌ No response from server`);
        console.log(`  📝 Error: ${err.message}`);
      } else {
        console.log(`  ❌ Error: ${err.message}`);
      }
    }
    console.log("");
  }

  console.log("✅ API testing completed!");
}

testEndpoints().catch(console.error);

