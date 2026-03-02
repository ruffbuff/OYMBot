// Quick test script to verify agent loading
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const agentId = process.argv[2] || 'testingloh';
const agentPath = path.join(__dirname, 'agents', agentId, 'AGENT.md');

console.log(`\n🔍 Testing agent load: ${agentId}`);
console.log(`📁 Path: ${agentPath}\n`);

try {
  const content = fs.readFileSync(agentPath, 'utf-8');
  const { data } = matter(content);
  
  console.log('✅ Agent loaded successfully!\n');
  console.log('📋 Configuration:');
  console.log(JSON.stringify(data, null, 2));
  
  console.log('\n🔑 Telegram config:');
  if (data.telegram) {
    console.log(`  Token: ${data.telegram.token ? '✅ Present' : '❌ Missing'}`);
    console.log(`  Enabled: ${data.telegram.enabled}`);
    console.log(`  Token preview: ${data.telegram.token ? data.telegram.token.slice(0, 10) + '...' : 'N/A'}`);
  } else {
    console.log('  ❌ No telegram config found');
  }
  
  console.log('\n🛠 Tools config:');
  if (data.tools) {
    console.log(`  Enabled: ${data.tools.enabled?.join(', ') || 'none'}`);
    console.log(`  Disabled: ${data.tools.disabled?.join(', ') || 'none'}`);
  } else {
    console.log('  ❌ No tools config found');
  }
  
} catch (error) {
  console.error('❌ Error loading agent:', error.message);
  process.exit(1);
}
