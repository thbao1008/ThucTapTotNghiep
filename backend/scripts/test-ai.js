const BASE_URL = 'http://localhost:4000';

async function testAI() {
  try {
    console.log('🔐 Testing login...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@gmail.com',
        password: 'aesp'
      })
    });
    const loginData = await loginRes.json();
    console.log('Login response status:', loginRes.status);
    if (!loginRes.ok) throw new Error(loginData.message || 'Login failed');
    const token = loginData.token;
    console.log('✅ Login OK, token received');

    console.log('🤖 Testing AI status...');
    const aiStatusRes = await fetch(`${BASE_URL}/api/ai/aiesp/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const aiStatusData = await aiStatusRes.json();
    if (!aiStatusRes.ok) throw new Error(aiStatusData.message || 'AI status failed');
    console.log('✅ AI status OK:', aiStatusData);

    console.log('💬 Testing AI conversation...');
    const aiConvRes = await fetch(`${BASE_URL}/api/ai/assistant/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        message: 'Hello AI, can you help me learn English?'
      })
    });
    const aiConvData = await aiConvRes.json();
    if (!aiConvRes.ok) throw new Error(aiConvData.message || 'AI conversation failed');
    console.log('✅ AI conversation OK, response length:', aiConvData.response?.length || 0);

    console.log('🎯 Testing AI auto topics...');
    const aiTopicsRes = await fetch(`${BASE_URL}/api/ai/auto-topics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        text: 'I want to learn programming and technology'
      })
    });
    const aiTopicsData = await aiTopicsRes.json();
    if (!aiTopicsRes.ok) throw new Error(aiTopicsData.message || 'AI auto topics failed');
    console.log('✅ AI auto topics OK:', aiTopicsData);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

testAI();