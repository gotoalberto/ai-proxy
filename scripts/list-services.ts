#!/usr/bin/env tsx
/**
 * List Services Script
 *
 * Lists all configured services from config/services.json
 *
 * Usage:
 *   npm run service:list
 */

import { listServices } from '../lib/config-loader';

async function main() {
  console.log('📋 Configured Services');
  console.log('━'.repeat(70));
  console.log('');

  try {
    const services = await listServices();

    if (services.length === 0) {
      console.log('No services configured yet.');
      console.log('');
      console.log('Create your first service:');
      console.log('  npm run service:create -- --slug anthropic --name "Anthropic" ...');
      return;
    }

    console.log(`Total: ${services.length} service(s)`);
    console.log('');

    // Group by auth type
    const byAuthType: Record<string, typeof services> = {};
    services.forEach(service => {
      if (!byAuthType[service.authType]) {
        byAuthType[service.authType] = [];
      }
      byAuthType[service.authType].push(service);
    });

    // Display by auth type
    Object.entries(byAuthType).forEach(([authType, servicesGroup]) => {
      console.log(`${authType.toUpperCase()} Authentication (${servicesGroup.length})`);
      console.log('─'.repeat(70));

      servicesGroup.forEach(service => {
        console.log(`  ${service.slug}`);
        console.log(`    Name: ${service.name}`);
        console.log(`    Base URL: ${service.targetBaseUrl}`);
        if (service.authHeader) {
          console.log(`    Auth Header: ${service.authHeader}`);
        }
        if (service.authQueryParam) {
          console.log(`    Auth Query Param: ${service.authQueryParam}`);
        }
        console.log(`    Secret: ${service.secretName}`);
        if (service.description) {
          console.log(`    Description: ${service.description}`);
        }
        console.log('');
      });
    });

    console.log('━'.repeat(70));
    console.log('');
    console.log('Service management:');
    console.log('  Create service:  npm run service:create -- --slug <slug> ...');
    console.log('  Edit service:    Edit config/services.json directly');
    console.log('');

  } catch (error) {
    console.error('Error loading services:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
