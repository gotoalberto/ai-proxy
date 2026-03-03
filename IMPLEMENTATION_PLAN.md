# AI Proxy - Implementation Plan

## Overview
Crear un API Gateway universal que proxy peticiones a múltiples servicios de IA y cloud (Anthropic, OpenAI, AWS, etc.), gestionando la autenticación y credenciales a través de **AWS Secrets Manager** en lugar de una base de datos.

## Diferencias Clave vs agentic-apis

### ❌ Eliminado
- ✅ PostgreSQL + Prisma
- ✅ Base de datos para almacenar servicios, agentes, y API keys
- ✅ Relaciones complejas Agent-Service-ApiKey
- ✅ Migraciones de base de datos

### ✅ Nuevo Enfoque
- ✅ AWS Secrets Manager para almacenar todas las credenciales
- ✅ Configuración basada en archivos (JSON/YAML)
- ✅ Variables de entorno para AWS credentials del proxy
- ✅ API keys de agentes como simples strings validados contra Secrets Manager
- ✅ Sin estado persistente - todo en AWS

---

## Architecture

```
┌─────────────┐
│   Client    │
│  (LLM/App)  │
└──────┬──────┘
       │ x-api-key: agk_xxx
       │
       ▼
┌─────────────────────────────────────┐
│        AI Proxy (Next.js)           │
│                                      │
│  1. Validate API Key                │
│  2. Load Service Config             │
│  3. Get Credentials from Secrets    │
│  4. Sign Request (if AWS)           │
│  5. Proxy to Target                 │
└──────┬──────────────────────────────┘
       │
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│ Anthropic│   │  OpenAI  │   │   AWS    │
└──────────┘   └──────────┘   └──────────┘

                      │
                      ▼
              ┌────────────────┐
              │ AWS Secrets    │
              │   Manager      │
              │                │
              │ • Service Creds│
              │ • API Keys     │
              └────────────────┘
```

---

## Data Model

### 1. Services Configuration (`config/services.json`)
```json
{
  "services": [
    {
      "slug": "anthropic",
      "name": "Anthropic Claude",
      "targetBaseUrl": "https://api.anthropic.com",
      "authType": "header",
      "authHeader": "x-api-key",
      "secretName": "ai-proxy/services/anthropic"
    },
    {
      "slug": "aws-s3",
      "name": "AWS S3",
      "targetBaseUrl": "https://s3.us-east-1.amazonaws.com",
      "authType": "aws-sigv4",
      "secretName": "ai-proxy/services/aws"
    }
  ]
}
```

### 2. Agents Configuration (`config/agents.json`)
```json
{
  "agents": [
    {
      "id": "agent-001",
      "name": "my-agent",
      "services": ["anthropic", "aws-s3", "elevenlabs"],
      "apiKeySecretName": "ai-proxy/agents/my-agent/api-keys"
    }
  ]
}
```

### 3. AWS Secrets Manager Structure

#### Service Credentials
```
Secret Name: ai-proxy/services/anthropic
Value: {
  "apiKey": "sk-ant-api03-..."
}

Secret Name: ai-proxy/services/aws
Value: {
  "accessKeyId": "AKIA...",
  "secretAccessKey": "...",
  "region": "us-east-1"
}
```

#### Agent API Keys
```
Secret Name: ai-proxy/agents/my-agent/api-keys
Value: {
  "keys": [
    {
      "id": "key-001",
      "key": "hashed_agk_xxx",
      "label": "Production Key",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## Implementation Phases

### Phase 1: Project Setup ✅
**Goal**: Bootstrap Next.js project with basic structure

**Tasks**:
- [x] Clone empty repository
- [ ] Initialize Next.js 15 with TypeScript
- [ ] Setup folder structure
- [ ] Configure ESLint, Prettier
- [ ] Add AWS SDK dependencies
- [ ] Create `.env.example` with required variables
- [ ] Initial README

**Files**:
```
ai-proxy/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── proxy/
│   ├── lib/
│   │   ├── aws-secrets.ts
│   │   ├── aws-signer.ts
│   │   ├── config-loader.ts
│   │   └── proxy.ts
│   └── types/
│       └── index.ts
├── config/
│   ├── services.json
│   └── agents.json
├── scripts/
│   └── create-secret.ts
└── package.json
```

**Environment Variables**:
```env
# AWS Credentials for Secrets Manager access
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Optional: Secrets prefix
SECRETS_PREFIX=ai-proxy/
```

---

### Phase 2: AWS Secrets Manager Integration ✅
**Goal**: Create module to read/write secrets

**Tasks**:
- [ ] Create `aws-secrets.ts` module
- [ ] Implement `getServiceCredentials(slug)`
- [ ] Implement `getAgentApiKeys(agentId)`
- [ ] Implement `createServiceSecret(slug, credentials)`
- [ ] Implement `createAgentApiKey(agentId, label)`
- [ ] Add caching layer (in-memory with TTL)
- [ ] Error handling and retries

**API**:
```typescript
// lib/aws-secrets.ts
export interface ServiceCredentials {
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  [key: string]: any;
}

export async function getServiceCredentials(
  slug: string
): Promise<ServiceCredentials>;

export async function getAgentApiKeys(
  agentId: string
): Promise<AgentApiKey[]>;

export async function createServiceSecret(
  slug: string,
  credentials: ServiceCredentials
): Promise<void>;

export async function createAgentApiKey(
  agentId: string,
  label: string
): Promise<{ rawKey: string; hashedKey: string }>;
```

---

### Phase 3: Configuration System ✅
**Goal**: Load services and agents from JSON files

**Tasks**:
- [ ] Create `config-loader.ts`
- [ ] Implement `loadServices()`
- [ ] Implement `loadAgents()`
- [ ] Validate configuration schemas
- [ ] Add hot-reload for development
- [ ] Cache configurations

**API**:
```typescript
// lib/config-loader.ts
export interface ServiceConfig {
  slug: string;
  name: string;
  targetBaseUrl: string;
  authType: 'header' | 'query' | 'aws-sigv4';
  authHeader?: string;
  authQueryParam?: string;
  secretName: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  services: string[];
  apiKeySecretName: string;
}

export async function getServiceConfig(slug: string): Promise<ServiceConfig>;
export async function getAgentConfig(agentId: string): Promise<AgentConfig>;
export async function listServices(): Promise<ServiceConfig[]>;
```

---

### Phase 4: Proxy Core Logic ✅
**Goal**: Implement request validation and proxying

**Tasks**:
- [ ] Port proxy logic from agentic-apis
- [ ] Adapt to use Secrets Manager instead of DB
- [ ] Implement API key validation
- [ ] Keep AWS SigV4 signing logic
- [ ] Add request/response logging
- [ ] Error handling

**Flow**:
```typescript
// src/app/api/proxy/[slug]/[[...path]]/route.ts
1. Extract API key from headers
2. Hash API key (SHA256)
3. Find agent by searching all agent secrets
4. Validate agent has access to service
5. Load service config
6. Get service credentials from Secrets Manager
7. Build target URL
8. Sign request (if AWS service)
9. Proxy to target
10. Return response
```

---

### Phase 5: CLI Tools ✅
**Goal**: Scripts to manage services and agents

**Tasks**:
- [ ] Create `scripts/create-service.ts`
- [ ] Create `scripts/create-agent.ts`
- [ ] Create `scripts/create-api-key.ts`
- [ ] Create `scripts/list-services.ts`
- [ ] Create `scripts/list-agents.ts`
- [ ] Add to package.json scripts

**Usage**:
```bash
# Create a service
npm run service:create -- \
  --slug anthropic \
  --name "Anthropic Claude" \
  --base-url "https://api.anthropic.com" \
  --auth-type header \
  --auth-header x-api-key \
  --api-key "sk-ant-xxx"

# Create an agent
npm run agent:create -- \
  --id agent-001 \
  --name my-agent \
  --services anthropic,aws-s3,elevenlabs

# Create API key for agent
npm run apikey:create -- \
  --agent agent-001 \
  --label "Production Key"
# Returns: agk_xxx (save this!)

# List services
npm run service:list

# List agents
npm run agent:list
```

---

### Phase 6: Migration & Testing ✅
**Goal**: Migrate existing services from agentic-apis

**Tasks**:
- [ ] Export services from agentic-apis DB
- [ ] Create migration script
- [ ] Migrate all AWS services (45)
- [ ] Migrate AI services (Anthropic, ElevenLabs, etc)
- [ ] Migrate Alchemy networks (47)
- [ ] Create test suite
- [ ] Test all service types
- [ ] Performance testing

**Migration Script**:
```typescript
// scripts/migrate-from-agentic-apis.ts
// 1. Read from agentic-apis database
// 2. Create secrets in AWS Secrets Manager
// 3. Generate config/services.json
// 4. Generate config/agents.json
```

---

### Phase 7: Documentation & Deployment ✅
**Goal**: Deploy and document

**Tasks**:
- [ ] Update README with architecture
- [ ] API documentation
- [ ] Deployment guide (Vercel)
- [ ] Environment setup guide
- [ ] AWS IAM policy examples
- [ ] Troubleshooting guide
- [ ] Deploy to Vercel
- [ ] Setup custom domain

---

## Key Benefits

### 🔒 Security
- ✅ Credentials never in code or database
- ✅ AWS Secrets Manager encryption at rest
- ✅ Automatic rotation support
- ✅ Fine-grained IAM permissions
- ✅ Audit trail via CloudTrail

### 🚀 Performance
- ✅ No database queries for every request
- ✅ In-memory caching of secrets (with TTL)
- ✅ Cached configuration files
- ✅ Faster cold starts

### 🛠️ Operations
- ✅ Easier to deploy (no DB migrations)
- ✅ Configuration as code
- ✅ Easy backup/restore (just secrets + config files)
- ✅ Environment parity (dev/staging/prod)

### 💰 Cost
- ✅ No database hosting costs
- ✅ AWS Secrets Manager: $0.40/secret/month
- ✅ ~100 secrets = $40/month (vs RDS $15-50/month + complexity)

---

## Secrets Manager Cost Estimate

**Services**: ~100 services (45 AWS + 47 Alchemy + 8 AI services)
- 100 secrets × $0.40/month = **$40/month**

**Agents**: ~5 agents
- 5 secrets × $0.40/month = **$2/month**

**API Calls**: ~10,000 requests/month
- 10,000 calls × $0.05/10,000 = **$0.05/month**

**Total**: ~**$42/month**

**Cache Strategy**: Cache secrets for 5 minutes
- Reduces API calls by 99%
- Actual cost: ~**$40/month** (mostly storage)

---

## AWS IAM Policy Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecrets"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:ai-proxy/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:UpdateSecret",
        "secretsmanager:PutSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:ai-proxy/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "us-east-1"
        }
      }
    }
  ]
}
```

---

## Risk Mitigation

### Risk: Secrets Manager API Limits
- **Mitigation**: Aggressive caching (5-15 min TTL)
- **Fallback**: Environment variable override for critical services

### Risk: AWS Credentials Compromise
- **Mitigation**: Use IAM roles in production (Vercel + AWS OIDC)
- **Mitigation**: Principle of least privilege
- **Mitigation**: Regular credential rotation

### Risk: Configuration File Errors
- **Mitigation**: JSON schema validation
- **Mitigation**: CI/CD validation
- **Mitigation**: Rollback capability

### Risk: Cold Start Performance
- **Mitigation**: Lazy loading of secrets
- **Mitigation**: Vercel Edge Functions for routing
- **Mitigation**: Warm-up functions

---

## Success Criteria

- ✅ All existing services from agentic-apis working
- ✅ Response time < 500ms (p95)
- ✅ No database dependencies
- ✅ Easy to add new services (< 5 min)
- ✅ Easy to add new agents (< 2 min)
- ✅ Comprehensive documentation
- ✅ Test coverage > 80%

---

## Next Steps

1. **Approve this plan** ✋
2. Initialize Next.js project
3. Implement Phase 1-2 (Setup + Secrets Manager)
4. Test with 1-2 services
5. Continue with remaining phases

---

## Questions for Approval

1. ✅ **Caching Strategy**: 5 minutes TTL for secrets OK?
2. ✅ **Config Format**: JSON files vs YAML? (propuesta: JSON)
3. ✅ **Agent API Key Format**: Keep `agk_` prefix?
4. ✅ **Secrets Prefix**: `ai-proxy/` vs `ai-gateway/`?
5. ✅ **Migration**: Do we keep agentic-apis running during migration?

---

**Ready to proceed?** 🚀
