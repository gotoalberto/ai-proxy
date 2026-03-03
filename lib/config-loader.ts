/**
 * Configuration Loader
 *
 * Loads services and agents configuration from JSON files.
 * Provides caching and validation.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  ServiceConfig,
  AgentConfig,
  ServicesConfiguration,
  AgentsConfiguration,
} from '@/types';

const CONFIG_DIR = join(process.cwd(), 'config');
const CACHE_TTL = 60000; // 1 minute

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

/**
 * Get value from cache if not expired
 */
function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

/**
 * Set value in cache with TTL
 */
function setInCache<T>(key: string, value: T): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL,
  });
}

/**
 * Load services configuration
 */
export async function loadServicesConfig(): Promise<ServicesConfiguration> {
  const cacheKey = 'services-config';
  const cached = getFromCache<ServicesConfiguration>(cacheKey);
  if (cached) return cached;

  const configPath = join(CONFIG_DIR, 'services.json');
  const content = await readFile(configPath, 'utf-8');
  const config = JSON.parse(content) as ServicesConfiguration;

  // Validate configuration
  if (!config.services || !Array.isArray(config.services)) {
    throw new Error('Invalid services configuration: services must be an array');
  }

  setInCache(cacheKey, config);
  return config;
}

/**
 * Load agents configuration
 */
export async function loadAgentsConfig(): Promise<AgentsConfiguration> {
  const cacheKey = 'agents-config';
  const cached = getFromCache<AgentsConfiguration>(cacheKey);
  if (cached) return cached;

  const configPath = join(CONFIG_DIR, 'agents.json');
  const content = await readFile(configPath, 'utf-8');
  const config = JSON.parse(content) as AgentsConfiguration;

  // Validate configuration
  if (!config.agents || !Array.isArray(config.agents)) {
    throw new Error('Invalid agents configuration: agents must be an array');
  }

  setInCache(cacheKey, config);
  return config;
}

/**
 * Get service configuration by slug
 */
export async function getServiceConfig(
  slug: string
): Promise<ServiceConfig | null> {
  const config = await loadServicesConfig();
  return config.services.find(s => s.slug === slug) || null;
}

/**
 * Get agent configuration by ID
 */
export async function getAgentConfig(
  agentId: string
): Promise<AgentConfig | null> {
  const config = await loadAgentsConfig();
  return config.agents.find(a => a.id === agentId) || null;
}

/**
 * List all services
 */
export async function listServices(): Promise<ServiceConfig[]> {
  const config = await loadServicesConfig();
  return config.services;
}

/**
 * List all agents
 */
export async function listAgents(): Promise<AgentConfig[]> {
  const config = await loadAgentsConfig();
  return config.agents;
}

/**
 * Check if agent has access to service
 */
export async function agentHasAccessToService(
  agentId: string,
  serviceSlug: string
): Promise<boolean> {
  const agent = await getAgentConfig(agentId);
  if (!agent) return false;

  return agent.services.includes(serviceSlug);
}

/**
 * Clear configuration cache
 */
export function clearConfigCache(): void {
  cache.clear();
  console.log('[Config] Cache cleared');
}
