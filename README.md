# AI Proxy

Universal API Gateway for AI and Cloud Services with AWS Secrets Manager integration.

## Overview

AI Proxy is a Next.js-based API gateway that proxies requests to multiple AI and cloud services (Anthropic, OpenAI, AWS, etc.), managing authentication and credentials through **AWS Secrets Manager** instead of a traditional database.

### Key Features

- 🔒 **Secure Credentials** - All API keys and credentials stored in AWS Secrets Manager
- 🚀 **Zero Database** - Configuration as code, no database migrations
- ⚡ **AWS SigV4 Signing** - Full support for AWS services (S3, DynamoDB, Lambda, etc.)
- 🎯 **Simple Configuration** - JSON-based service and agent configuration
- 📦 **Easy Deployment** - Deploy to AWS Amplify with IAM role authentication
- 🔄 **Smart Caching** - In-memory caching for secrets and configuration

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

## Quick Start

### Prerequisites

- Node.js 18+
- AWS account with Secrets Manager access
- AWS credentials configured (for local development)
- IAM permissions for Secrets Manager (GetSecretValue, CreateSecret, UpdateSecret)

### Installation

```bash
# Clone repository
git clone https://github.com/gotoalberto/ai-proxy.git
cd ai-proxy

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Configure AWS credentials in .env.local
# AWS_ACCESS_KEY_ID=AKIA...
# AWS_SECRET_ACCESS_KEY=...
# AWS_REGION=us-east-1
```

### Quick Setup

```bash
# 1. Create your first service (Anthropic)
npm run service:create -- \
  --slug anthropic \
  --name "Anthropic Claude" \
  --base-url "https://api.anthropic.com" \
  --auth-type header \
  --auth-header x-api-key \
  --api-key "sk-ant-xxx..."

# 2. Create your first agent
npm run agent:create -- \
  --id agent-001 \
  --name my-agent \
  --services anthropic \
  --description "My first agent"

# 3. Create an API key for the agent
npm run apikey:create -- \
  --agent agent-001 \
  --label "Development Key"

# Save the generated API key (agk_xxx...)

# 4. Start the dev server
npm run dev

# 5. Test it!
curl http://localhost:3000/api/proxy/anthropic/v1/messages \
  -H "x-api-key: agk_xxx..." \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-haiku-20240307",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

### Environment Variables

```env
# AWS Credentials (for local development)
# In production (AWS Amplify), these are provided by IAM role
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Secrets Manager Configuration
SECRETS_PREFIX=ai-proxy/

# Cache TTL (seconds)
SECRETS_CACHE_TTL=300
```

### Development

```bash
# Start development server
npm run dev

# The proxy will be available at:
# http://localhost:3000/api/proxy/[service]/[path]
```

## Configuration

### Services Configuration

Edit `config/services.json` to add services:

```json
{
  "services": [
    {
      "slug": "anthropic",
      "name": "Anthropic Claude",
      "targetBaseUrl": "https://api.anthropic.com",
      "authType": "header",
      "authHeader": "x-api-key",
      "secretName": "ai-proxy/services/anthropic",
      "description": "Anthropic Claude AI API"
    }
  ]
}
```

### Agents Configuration

Edit `config/agents.json` to configure agents:

```json
{
  "agents": [
    {
      "id": "agent-001",
      "name": "my-agent",
      "services": ["anthropic", "aws-s3"],
      "apiKeySecretName": "ai-proxy/agents/agent-001/api-keys",
      "description": "Main agent"
    }
  ]
}
```

## CLI Tools

### Create a Service

```bash
npm run service:create -- \
  --slug anthropic \
  --name "Anthropic Claude" \
  --base-url "https://api.anthropic.com" \
  --auth-type header \
  --auth-header x-api-key \
  --api-key "sk-ant-xxx"
```

### Create an AWS Service

```bash
npm run service:create -- \
  --slug aws-s3 \
  --name "AWS S3" \
  --base-url "https://s3.us-east-1.amazonaws.com" \
  --auth-type aws-sigv4 \
  --access-key-id "AKIA..." \
  --secret-access-key "..." \
  --region us-east-1
```

### Create Agent API Key

```bash
npm run apikey:create -- \
  --agent agent-001 \
  --label "Production Key"

# Output: agk_xxx... (save this!)
```

## Usage

### Making Requests

```bash
# Anthropic Claude
curl https://your-domain.com/api/proxy/anthropic/v1/messages \
  -H "x-api-key: agk_xxx" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-haiku-20240307",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'

# AWS S3 - List buckets
curl https://your-domain.com/api/proxy/aws-s3/ \
  -H "x-api-key: agk_xxx"

# AWS S3 - List objects in bucket
curl "https://your-domain.com/api/proxy/aws-s3/my-bucket?list-type=2" \
  -H "x-api-key: agk_xxx"

# AWS S3 - Upload file
curl -X PUT "https://your-domain.com/api/proxy/aws-s3/my-bucket/file.txt" \
  -H "x-api-key: agk_xxx" \
  -H "Content-Type: text/plain" \
  -d "Hello World"
```

## Deployment

### AWS Amplify

1. Create new Amplify app from GitHub repository
2. Configure build settings:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: .next
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
   ```

3. Add environment variables in Amplify console:
   ```
   AWS_REGION=us-east-1
   SECRETS_PREFIX=ai-proxy/
   SECRETS_CACHE_TTL=300
   ```

4. Attach IAM role with Secrets Manager permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue",
           "secretsmanager:DescribeSecret"
         ],
         "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:ai-proxy/*"
       }
     ]
   }
   ```

5. Deploy!

## Supported Services

### AI Services
- ✅ Anthropic Claude
- ✅ OpenAI GPT
- ✅ ElevenLabs (Text-to-Speech)

### AWS Services (45+)
- ✅ S3 (Storage)
- ✅ DynamoDB (NoSQL Database)
- ✅ Lambda (Serverless Functions)
- ✅ SQS (Queue Service)
- ✅ SNS (Notification Service)
- ✅ And 40+ more AWS services

All AWS services include full AWS Signature V4 signing support.

## Security

- 🔒 Credentials never in code or configuration files
- 🔐 AWS Secrets Manager encryption at rest
- 🔄 Automatic credential rotation support
- 👮 Fine-grained IAM permissions
- 📝 Audit trail via AWS CloudTrail
- 💾 In-memory caching only (no persistent storage)

## Cost

### AWS Secrets Manager
- $0.40 per secret per month
- $0.05 per 10,000 API calls
- With 5-minute caching: ~$40/month for 100 secrets

### AWS Amplify
- Free tier: 1000 build minutes/month
- $0.01 per build minute after that
- Hosting: First 15GB free, then $0.15/GB

## Performance

- ⚡ Response time < 500ms (p95)
- 🚀 In-memory caching reduces Secrets Manager calls by 99%
- 📦 No database queries
- 🔄 Configuration file caching (1 minute TTL)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run linter
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
ai-proxy/
├── app/
│   └── api/
│       └── proxy/
│           └── [slug]/
│               └── [[...path]]/
│                   └── route.ts      # Proxy route handler
├── lib/
│   ├── aws-secrets.ts               # Secrets Manager integration
│   ├── aws-signer.ts                # AWS SigV4 signing
│   ├── config-loader.ts             # Configuration loader
│   └── proxy.ts                     # Proxy logic
├── types/
│   └── index.ts                     # TypeScript types
├── config/
│   ├── services.json                # Services configuration
│   └── agents.json                  # Agents configuration
├── scripts/
│   ├── create-service.ts            # CLI: Create service
│   ├── create-agent.ts              # CLI: Create agent
│   └── create-api-key.ts            # CLI: Create API key
└── package.json
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

For issues or questions:
- GitHub Issues: https://github.com/gotoalberto/ai-proxy/issues
