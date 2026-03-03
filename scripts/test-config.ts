#!/usr/bin/env tsx
/**
 * Test Configuration System
 *
 * Tests that the configuration loader can read services and agents correctly
 * and that the access control logic works as expected.
 *
 * Usage:
 *   npm run test:config
 */

import {
  loadServicesConfig,
  loadAgentsConfig,
  getServiceConfig,
  getAgentConfig,
  agentHasAccessToService,
  listServices,
  listAgents,
} from '../lib/config-loader';

async function main() {
  console.log('🧪 Testing Configuration System');
  console.log('━'.repeat(70));
  console.log('');

  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  const test = async (name: string, fn: () => Promise<boolean>) => {
    testsRun++;
    process.stdout.write(`  Testing: ${name}... `);
    try {
      const result = await fn();
      if (result) {
        console.log('✅ PASS');
        testsPassed++;
      } else {
        console.log('❌ FAIL');
        testsFailed++;
      }
    } catch (error) {
      console.log('❌ ERROR:', error instanceof Error ? error.message : error);
      testsFailed++;
    }
  };

  // Test 1: Load services configuration
  await test('Load services configuration', async () => {
    const config = await loadServicesConfig();
    return config.services.length > 0;
  });

  // Test 2: Load agents configuration
  await test('Load agents configuration', async () => {
    const config = await loadAgentsConfig();
    return config.agents.length > 0;
  });

  // Test 3: Get specific service by slug
  await test('Get service by slug (anthropic)', async () => {
    const service = await getServiceConfig('anthropic');
    return service !== null && service.slug === 'anthropic';
  });

  // Test 4: Get non-existent service returns null
  await test('Get non-existent service returns null', async () => {
    const service = await getServiceConfig('non-existent-service');
    return service === null;
  });

  // Test 5: Get specific agent by id
  await test('Get agent by id (agent-001)', async () => {
    const agent = await getAgentConfig('agent-001');
    return agent !== null && agent.id === 'agent-001';
  });

  // Test 6: Get non-existent agent returns null
  await test('Get non-existent agent returns null', async () => {
    const agent = await getAgentConfig('non-existent-agent');
    return agent === null;
  });

  // Test 7: Check agent access to service (positive case)
  await test('Agent has access to assigned service', async () => {
    const hasAccess = await agentHasAccessToService('agent-001', 'anthropic');
    return hasAccess === true;
  });

  // Test 8: Check agent access to service (negative case)
  await test('Agent does not have access to unassigned service', async () => {
    // Create a test service that agent-001 doesn't have access to
    const hasAccess = await agentHasAccessToService('agent-001', 'fake-service');
    return hasAccess === false;
  });

  // Test 9: List all services
  await test('List all services returns array', async () => {
    const services = await listServices();
    return Array.isArray(services) && services.length > 0;
  });

  // Test 10: List all agents
  await test('List all agents returns array', async () => {
    const agents = await listAgents();
    return Array.isArray(agents) && agents.length > 0;
  });

  // Test 11: Service has required fields
  await test('Service has all required fields', async () => {
    const service = await getServiceConfig('anthropic');
    if (!service) return false;
    return (
      typeof service.slug === 'string' &&
      typeof service.name === 'string' &&
      typeof service.targetBaseUrl === 'string' &&
      typeof service.authType === 'string' &&
      typeof service.secretName === 'string'
    );
  });

  // Test 12: Agent has required fields
  await test('Agent has all required fields', async () => {
    const agent = await getAgentConfig('agent-001');
    if (!agent) return false;
    return (
      typeof agent.id === 'string' &&
      typeof agent.name === 'string' &&
      Array.isArray(agent.services) &&
      typeof agent.apiKeySecretName === 'string'
    );
  });

  // Test 13: Configuration caching works
  await test('Configuration caching works', async () => {
    const start = Date.now();
    await loadServicesConfig(); // Should hit cache
    const duration = Date.now() - start;
    // Cache should make this nearly instantaneous (< 10ms)
    return duration < 10;
  });

  // Test 14: AWS service has correct auth type
  await test('AWS services have aws-sigv4 auth type', async () => {
    const service = await getServiceConfig('aws-s3');
    return service !== null && service.authType === 'aws-sigv4';
  });

  // Test 15: Header auth service has auth header
  await test('Header auth services have authHeader field', async () => {
    const service = await getServiceConfig('anthropic');
    return service !== null && typeof service.authHeader === 'string';
  });

  console.log('');
  console.log('━'.repeat(70));
  console.log('');
  console.log(`Tests run: ${testsRun}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log('');

  if (testsFailed > 0) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    console.log('');
    console.log('Configuration system is working correctly.');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
