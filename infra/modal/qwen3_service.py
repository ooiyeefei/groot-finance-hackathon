"""
FinanSEAL Qwen3-30B-A3B Chat Service on Modal.com

Cost-optimized deployment using FP8 quantization on L4 GPU.
- Model: Qwen/Qwen3-30B-A3B-FP8 (~18GB VRAM)
- GPU: NVIDIA L4 24GB ($0.80/hr)
- Cold start: ~60-90 seconds (saves money when idle)

Usage:
    # Deploy
    modal deploy infra/modal/qwen3_service.py

    # Test locally
    modal run infra/modal/qwen3_service.py

    # Get endpoint URL after deploy
    modal app list
"""

import modal

# Modal app configuration
app = modal.App("finanseal-qwen3")

# Pre-download model image to speed up cold starts
model_id = "Qwen/Qwen3-30B-A3B-FP8"

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm>=0.8.5",
        "transformers>=4.51.0",
        "torch>=2.4.0",
        "huggingface_hub",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    # Pre-download model weights during image build (faster cold starts)
    .run_commands(
        f"huggingface-cli download {model_id} --local-dir /model-cache/{model_id}"
    )
)


@app.cls(
    gpu=modal.gpu.L4(),  # 24GB VRAM, $0.80/hr - most cost effective
    image=vllm_image,
    container_idle_timeout=300,  # 5 min idle = shutdown (saves money!)
    allow_concurrent_inputs=10,  # Handle multiple requests
    volumes={
        "/model-cache": modal.Volume.from_name("finanseal-model-cache", create_if_missing=True)
    },
)
class Qwen3Service:
    """
    vLLM-based Qwen3 inference service with OpenAI-compatible API.
    """

    @modal.enter()
    def load_model(self):
        """Load model on container startup."""
        from vllm import LLM, SamplingParams

        print(f"Loading model: {model_id}")
        self.llm = LLM(
            model=f"/model-cache/{model_id}",
            tensor_parallel_size=1,
            max_model_len=32768,  # 32K context
            trust_remote_code=True,
            gpu_memory_utilization=0.90,  # Use 90% of GPU memory
            dtype="auto",  # Use FP8 from model
        )
        self.tokenizer = self.llm.get_tokenizer()
        print("Model loaded successfully!")

    @modal.method()
    def generate(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
        tools: list[dict] | None = None,
        enable_thinking: bool = False,
    ) -> dict:
        """
        Generate chat completion.

        Args:
            messages: OpenAI-format messages [{"role": "user", "content": "..."}]
            temperature: Sampling temperature (0.1 for deterministic)
            max_tokens: Maximum output tokens
            tools: Optional tool definitions for function calling
            enable_thinking: Enable reasoning mode (slower but better for complex tasks)

        Returns:
            dict with 'content', 'tool_calls', 'usage'
        """
        from vllm import SamplingParams

        # Apply chat template
        prompt = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=enable_thinking,
            tools=tools,
        )

        # Sampling params
        sampling_params = SamplingParams(
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=0.95 if enable_thinking else 0.8,
        )

        # Generate
        outputs = self.llm.generate([prompt], sampling_params)
        output = outputs[0]

        generated_text = output.outputs[0].text

        # Parse tool calls if present
        tool_calls = None
        content = generated_text

        if tools and "<tool_call>" in generated_text:
            import json
            import re
            tool_call_match = re.search(r'<tool_call>(.*?)</tool_call>', generated_text, re.DOTALL)
            if tool_call_match:
                try:
                    tool_calls = [json.loads(tool_call_match.group(1))]
                    content = generated_text.replace(tool_call_match.group(0), "").strip()
                except json.JSONDecodeError:
                    pass

        return {
            "content": content,
            "tool_calls": tool_calls,
            "usage": {
                "prompt_tokens": len(output.prompt_token_ids),
                "completion_tokens": len(output.outputs[0].token_ids),
            }
        }

    @modal.method()
    def health(self) -> dict:
        """Health check endpoint."""
        return {"status": "healthy", "model": model_id}


# ============================================
# OpenAI-Compatible API Endpoint
# ============================================

@app.function(
    image=modal.Image.debian_slim().pip_install("fastapi", "pydantic"),
    allow_concurrent_inputs=100,
)
@modal.asgi_app()
def openai_api():
    """
    OpenAI-compatible REST API endpoint.

    After deployment, use:
        https://your-app--finanseal-qwen3-openai-api.modal.run/v1/chat/completions
    """
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
    import time
    import uuid

    api = FastAPI(title="FinanSEAL Qwen3 API")

    class Message(BaseModel):
        role: str
        content: str

    class ChatRequest(BaseModel):
        model: str = "qwen3-30b"
        messages: list[Message]
        temperature: float = 0.1
        max_tokens: int = 4096
        tools: list[dict] | None = None
        stream: bool = False  # Streaming not implemented yet

    class ChatResponse(BaseModel):
        id: str
        object: str = "chat.completion"
        created: int
        model: str
        choices: list[dict]
        usage: dict

    @api.get("/health")
    async def health():
        return {"status": "ok"}

    @api.get("/v1/models")
    async def list_models():
        return {
            "object": "list",
            "data": [
                {
                    "id": "qwen3-30b",
                    "object": "model",
                    "created": 1700000000,
                    "owned_by": "finanseal"
                }
            ]
        }

    @api.post("/v1/chat/completions")
    async def chat_completions(request: ChatRequest):
        try:
            # Get the service
            service = Qwen3Service()

            # Convert messages to dict format
            messages = [{"role": m.role, "content": m.content} for m in request.messages]

            # Call the model
            result = service.generate.remote(
                messages=messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                tools=request.tools,
                enable_thinking=False,  # Default off for speed
            )

            # Format response
            return ChatResponse(
                id=f"chatcmpl-{uuid.uuid4().hex[:8]}",
                created=int(time.time()),
                model=request.model,
                choices=[{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": result["content"],
                        "tool_calls": result.get("tool_calls"),
                    },
                    "finish_reason": "stop" if not result.get("tool_calls") else "tool_calls",
                }],
                usage=result["usage"],
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return api


# ============================================
# CLI Test Function
# ============================================

@app.local_entrypoint()
def main():
    """Test the service locally."""
    print("Testing Qwen3 service...")

    service = Qwen3Service()

    # Test health
    health = service.health.remote()
    print(f"Health: {health}")

    # Test generation
    result = service.generate.remote(
        messages=[
            {"role": "system", "content": "You are a helpful financial assistant."},
            {"role": "user", "content": "What is GST in Singapore?"}
        ],
        temperature=0.1,
        max_tokens=500,
    )

    print(f"\nResponse: {result['content'][:500]}...")
    print(f"Usage: {result['usage']}")


# ============================================
# Deployment Instructions
# ============================================
"""
SETUP:
1. Install Modal CLI:
   pip install modal
   modal setup

2. Create volume for model cache:
   modal volume create finanseal-model-cache

3. Deploy the service:
   modal deploy infra/modal/qwen3_service.py

4. Get your endpoint URL:
   modal app list
   # Look for: finanseal-qwen3-openai-api

5. Update your .env:
   CHAT_MODEL_ENDPOINT_URL=https://your-username--finanseal-qwen3-openai-api.modal.run/v1
   CHAT_MODEL_MODEL_ID=qwen3-30b

COST MONITORING:
- Dashboard: https://modal.com/apps/finanseal-qwen3
- Set alerts at $50, $100, $150 spend

EXPECTED COSTS:
- Cold start: ~60-90 sec (first request after idle)
- Active inference: $0.80/hr
- Idle: $0.00/hr (container shuts down after 5 min)
- Typical usage (100 req/day): ~$20-30/month
"""
