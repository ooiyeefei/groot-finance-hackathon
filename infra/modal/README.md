# Modal.com Qwen3 Deployment for FinanSEAL

Cost-optimized LLM deployment using Qwen3-8B on Modal.com.

> **Note**: Qwen3-30B-A3B-FP8 (~18GB) doesn't fit on L4 GPU (24GB) due to KV cache
> requirements. Using Qwen3-8B (~16GB BF16) which provides excellent quality for
> financial chat tasks while fitting comfortably on L4.

## Cost Analysis

| Resource | Cost | Your Budget ($220) |
|----------|------|-------------------|
| L4 GPU (24GB) | $0.80/hr | 275 hours max |
| Cold start penalty | ~60-90 sec | Free (no charge) |
| Idle time | $0.00/hr | Free (container shuts down) |

### Estimated Monthly Costs

| Usage Pattern | Monthly Cost | Credits Last |
|--------------|--------------|--------------|
| Always-on 24/7 | $576/month | ~11 days |
| 8 hrs/day active | $192/month | ~5 weeks |
| 100 requests/day (~50 min) | $20/month | **11 months** |
| 500 requests/day (~4 hrs) | $96/month | ~2.3 months |

## Quick Start

### 1. Install Modal CLI

```bash
pip install modal
modal setup  # Login with your Modal account
```

### 2. Create Model Cache Volume

```bash
modal volume create finanseal-model-cache
```

### 3. Deploy

```bash
cd /path/to/finanseal-mvp
modal deploy infra/modal/qwen3_service.py
```

### 4. Get Your Endpoint URL

```bash
modal app list
# Output: finanseal-qwen3-openai-api -> https://YOUR_USERNAME--finanseal-qwen3-openai-api.modal.run
```

### 5. Update FinanSEAL Environment

```bash
# .env.local
CHAT_MODEL_ENDPOINT_URL=https://YOUR_USERNAME--finanseal-qwen3-openai-api.modal.run/v1
CHAT_MODEL_MODEL_ID=qwen3-8b
USE_GEMINI=false
```

## Testing

### Test via CLI

```bash
modal run infra/modal/qwen3_service.py
```

### Test via cURL

```bash
curl -X POST https://YOUR_USERNAME--finanseal-qwen3-openai-api.modal.run/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-8b",
    "messages": [{"role": "user", "content": "What is GST in Singapore?"}],
    "temperature": 0.1,
    "max_tokens": 1000
  }'
```

## Cost Optimization Tips

### 1. Cold Start Strategy (Recommended)
The default config uses `container_idle_timeout=300` (5 minutes). Container shuts down when idle = no charges.

- **Pros**: Only pay for actual usage
- **Cons**: First request after idle takes 60-90 seconds

### 2. Keep-Warm Strategy (For Production)
If cold starts are unacceptable, add keep-warm:

```python
@app.function(schedule=modal.Cron("*/4 * * * *"))  # Every 4 minutes
def keep_warm():
    Qwen3Service().health.remote()
```

- **Pros**: No cold starts
- **Cons**: ~$0.80/hr continuous cost

### 3. Hybrid Strategy
Keep warm during business hours only:

```python
@app.function(schedule=modal.Cron("*/4 9-18 * * 1-5"))  # 9am-6pm weekdays
def keep_warm_business_hours():
    Qwen3Service().health.remote()
```

## Monitoring

### Dashboard
Visit: https://modal.com/apps/finanseal-qwen3

### Set Spending Alerts
1. Go to Modal Dashboard → Settings → Billing
2. Add alerts at $50, $100, $150, $200

### View Logs

```bash
modal app logs finanseal-qwen3
```

## Troubleshooting

### Out of Memory
If you see OOM errors, reduce context length:

```python
self.llm = LLM(
    ...
    max_model_len=16384,  # Reduce from 32768
)
```

### Slow Cold Starts
Pre-download model in image (already configured):

```python
.run_commands(
    f"huggingface-cli download {model_id} --local-dir /model-cache/{model_id}"
)
```

### Rate Limits
Modal has default rate limits. For high traffic:

```python
@app.cls(
    ...
    allow_concurrent_inputs=50,  # Increase from 10
)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Modal.com                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  OpenAI-Compatible API (FastAPI)                     │   │
│  │  /v1/chat/completions                                │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │                                      │
│  ┌────────────────────▼────────────────────────────────┐   │
│  │  Qwen3Service (vLLM)                                 │   │
│  │  - L4 GPU (24GB)                                     │   │
│  │  - Qwen3-30B-A3B-FP8 (~18GB)                        │   │
│  │  - 32K context length                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  FinanSEAL (Vercel)                                         │
│  - LangGraph Agent calls Modal endpoint                     │
│  - Uses OpenAI-compatible format                            │
│  - No code changes needed (just env vars)                   │
└─────────────────────────────────────────────────────────────┘
```

## Comparison: Current vs Modal

| Aspect | Current (LiteLLM/Qwen3-30B) | Modal (Qwen3-8B) |
|--------|---------------------------|---------------------------|
| Model | qwen3-30b-fp8 | Qwen3-8B (BF16) |
| Parameters | 30B | 8B |
| Context | 32K | 16K |
| Cold start | N/A | ~55 seconds |
| Warm speed | ~10 tok/s | ~15 tok/s |
| Cost | Your infra | $0.80/hr (only when used) |
| Maintenance | You manage | Modal manages |
| Scaling | Manual | Auto |
