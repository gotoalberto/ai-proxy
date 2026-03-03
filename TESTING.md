# Testing Guide

This document describes how to test the AI Proxy locally before deployment.

## Prerequisites

Before testing, you need:

1. **AWS Credentials** configured in `.env.local`:
   ```env
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   ```

2. **Service Credentials** stored in AWS Secrets Manager:
   ```bash
   # Example: Create Anthropic service credentials
   npm run service:create -- \
     --slug anthropic \
     --name "Anthropic Claude" \
     --base-url "https://api.anthropic.com" \
     --auth-type header \
     --auth-header x-api-key \
     --api-key "sk-ant-xxx..."
   ```

3. **Agent API Key** created and stored:
   ```bash
   # Create API key for agent-001
   npm run apikey:create -- \
     --agent agent-001 \
     --label "Test Key"

   # Save the generated key: agk_xxx...
   ```

## Phase 4: Proxy Logic Testing

### Test 1: Anthropic Claude API

```bash
# Start dev server
npm run dev

# In another terminal, test the proxy
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

**Expected Result**: JSON response from Claude with a greeting message.

### Test 2: OpenAI GPT API

```bash
# First, create OpenAI service if not already done
npm run service:create -- \
  --slug openai \
  --name "OpenAI" \
  --base-url "https://api.openai.com" \
  --auth-type bearer \
  --auth-header Authorization \
  --api-key "sk-xxx..."

# Test the proxy
curl http://localhost:3000/api/proxy/openai/v1/chat/completions \
  -H "x-api-key: agk_xxx..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

**Expected Result**: JSON response from GPT with a greeting message.

### Test 3: AWS S3 (List Buckets)

```bash
# First, create AWS service if not already done
npm run service:create -- \
  --slug aws-s3 \
  --name "AWS S3" \
  --base-url "https://s3.us-east-1.amazonaws.com" \
  --auth-type aws-sigv4 \
  --access-key-id "AKIA..." \
  --secret-access-key "..." \
  --region us-east-1

# Test list buckets
curl http://localhost:3000/api/proxy/aws-s3/ \
  -H "x-api-key: agk_xxx..."
```

**Expected Result**: XML response listing your S3 buckets.

### Test 4: AWS S3 (List Objects in Bucket)

```bash
# Replace 'my-bucket' with your actual bucket name
curl "http://localhost:3000/api/proxy/aws-s3/my-bucket?list-type=2" \
  -H "x-api-key: agk_xxx..."
```

**Expected Result**: XML response listing objects in the bucket.

### Test 5: AWS S3 (Upload File)

```bash
curl -X PUT "http://localhost:3000/api/proxy/aws-s3/my-bucket/test.txt" \
  -H "x-api-key: agk_xxx..." \
  -H "Content-Type: text/plain" \
  -d "Hello from AI Proxy!"
```

**Expected Result**: Empty response with 200 status code.

### Test 6: AWS S3 (Download File)

```bash
curl "http://localhost:3000/api/proxy/aws-s3/my-bucket/test.txt" \
  -H "x-api-key: agk_xxx..."
```

**Expected Result**: File content: "Hello from AI Proxy!"

## Error Cases to Test

### Test 7: Invalid API Key

```bash
curl http://localhost:3000/api/proxy/anthropic/v1/messages \
  -H "x-api-key: invalid-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Result**: 401 Unauthorized with error message.

### Test 8: Missing API Key

```bash
curl http://localhost:3000/api/proxy/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Result**: 401 Unauthorized with error message.

### Test 9: Agent Without Access to Service

```bash
# Assuming agent-001 doesn't have access to a hypothetical service
curl http://localhost:3000/api/proxy/restricted-service/v1/endpoint \
  -H "x-api-key: agk_xxx..." \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Result**: 401 Unauthorized with error message.

### Test 10: Non-existent Service

```bash
curl http://localhost:3000/api/proxy/non-existent-service/v1/endpoint \
  -H "x-api-key: agk_xxx..." \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Result**: 401 Unauthorized or 404 Not Found.

## Performance Testing

### Cache Performance

1. Make the same request multiple times and verify:
   - First request: Loads credentials from Secrets Manager (~200ms)
   - Subsequent requests: Uses cached credentials (~50ms)

2. Wait 6 minutes and verify cache expiration works:
   - Request after 6 minutes: Reloads from Secrets Manager

### Concurrent Requests

```bash
# Run multiple requests in parallel
for i in {1..10}; do
  curl http://localhost:3000/api/proxy/anthropic/v1/messages \
    -H "x-api-key: agk_xxx..." \
    -H "Content-Type: application/json" \
    -H "anthropic-version: 2023-06-01" \
    -d '{
      "model": "claude-3-haiku-20240307",
      "messages": [{"role": "user", "content": "Test '$i'"}],
      "max_tokens": 50
    }' &
done
wait
```

**Expected Result**: All requests succeed without errors.

## Deployment Testing (AWS Amplify)

After deploying to Amplify:

1. **Test with production URL**:
   ```bash
   curl https://your-domain.amplifyapp.com/api/proxy/anthropic/v1/messages \
     -H "x-api-key: agk_xxx..." \
     -H "Content-Type: application/json" \
     -H "anthropic-version: 2023-06-01" \
     -d '{
       "model": "claude-3-haiku-20240307",
       "messages": [{"role": "user", "content": "Hello from production!"}],
       "max_tokens": 100
     }'
   ```

2. **Verify IAM role authentication**:
   - Check Amplify logs to ensure no AWS credential errors
   - Verify Secrets Manager access works via IAM role

3. **Monitor performance**:
   - Check CloudWatch logs for any errors
   - Monitor response times
   - Verify cache is working (check Secrets Manager API call counts)

## Troubleshooting

### "Access Denied" from Secrets Manager

- **Cause**: AWS credentials don't have SecretsManager permissions
- **Fix**: Add SecretsManager permissions to IAM user/role:
  ```json
  {
    "Effect": "Allow",
    "Action": [
      "secretsmanager:GetSecretValue",
      "secretsmanager:CreateSecret",
      "secretsmanager:UpdateSecret"
    ],
    "Resource": "arn:aws:secretsmanager:*:*:secret:ai-proxy/*"
  }
  ```

### "Service credentials not found"

- **Cause**: Service credentials not created in Secrets Manager
- **Fix**: Run `npm run service:create` to create the service

### "Invalid API key"

- **Cause**: API key not created or incorrect
- **Fix**: Run `npm run apikey:create` to generate a new API key

### AWS SigV4 "SignatureDoesNotMatch"

- **Cause**: Clock skew or incorrect credentials
- **Fix**:
  1. Verify AWS credentials are correct
  2. Check system time is synchronized
  3. Verify service configuration has correct region

## Success Criteria

Phase 4 testing is complete when:

- ✅ All 10 test cases pass
- ✅ Error handling works correctly
- ✅ Cache performance is optimal
- ✅ Concurrent requests work without issues
- ✅ AWS SigV4 signing works for S3 operations
- ✅ Header and bearer authentication work for AI services
