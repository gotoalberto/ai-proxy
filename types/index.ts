/**
 * Type definitions for AI Proxy
 */

export interface ServiceConfig {
  slug: string;
  name: string;
  targetBaseUrl: string;
  authType: 'header' | 'query' | 'aws-sigv4' | 'bearer' | 'none';
  authHeader?: string;
  authQueryParam?: string;
  secretName: string;
  description?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  services: string[]; // Array of service slugs
  apiKeySecretName: string;
  description?: string;
}

export interface ServicesConfiguration {
  services: ServiceConfig[];
}

export interface AgentsConfiguration {
  agents: AgentConfig[];
}

export interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
  query: Record<string, string | string[]>;
}

export interface ProxyResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
}
