"""
FinanSEAL Qwen3-30B-A3B Chat Service on Modal.com

Cost-optimized deployment on L4 GPU.
- Model: Qwen/Qwen3-8B (~16GB VRAM in BF16)
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
# Note: Qwen3-30B-A3B-FP8 requires >24GB VRAM, doesn't fit on L4
# Using Qwen3-8B which fits comfortably on L4 (24GB)
model_id = "Qwen/Qwen3-8B"

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm>=0.8.5",
        "transformers>=4.51.0",
        "torch>=2.4.0",
        "huggingface_hub",
        "hf_transfer",  # Fast downloads
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)


@app.cls(
    gpu="L4",  # 24GB VRAM, $0.80/hr - most cost effective
    image=vllm_image,
    scaledown_window=180,  # 3 min idle = shutdown (saves money!)
    startup_timeout=600,  # 10 min for first cold start (torch.compile)
    volumes={
        "/model-cache": modal.Volume.from_name("finanseal-model-cache", create_if_missing=True)
    },
)
@modal.concurrent(max_inputs=10)  # Handle multiple concurrent requests
class Qwen3Service:
    """
    vLLM-based Qwen3 inference service with OpenAI-compatible API.
    """

    @modal.enter()
    def load_model(self):
        """Load model on container startup."""
        from vllm import LLM
        from huggingface_hub import snapshot_download
        import os

        # Download model if not cached
        model_path = f"/model-cache/{model_id}"
        if not os.path.exists(model_path) or not os.listdir(model_path):
            print(f"Downloading model: {model_id}")
            snapshot_download(
                repo_id=model_id,
                local_dir=model_path,
            )

        print(f"Loading model from: {model_path}")
        self.llm = LLM(
            model=model_path,
            tensor_parallel_size=1,
            max_model_len=16384,  # 16K context
            trust_remote_code=True,
            gpu_memory_utilization=0.90,
            dtype="auto",
            enforce_eager=True,  # Skip torch.compile for faster cold starts
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

        # Parse tool calls if present and convert to OpenAI format
        tool_calls = None
        content = generated_text

        if tools and "<tool_call>" in generated_text:
            import json
            import re
            import uuid
            tool_call_match = re.search(r'<tool_call>(.*?)</tool_call>', generated_text, re.DOTALL)
            if tool_call_match:
                try:
                    raw_call = json.loads(tool_call_match.group(1))
                    # Convert to OpenAI tool call format
                    tool_calls = [{
                        "id": f"call_{uuid.uuid4().hex[:8]}",
                        "type": "function",
                        "function": {
                            "name": raw_call.get("name", ""),
                            "arguments": json.dumps(raw_call.get("arguments", {}))
                        }
                    }]
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

fastapi_image = modal.Image.debian_slim().pip_install("fastapi", "pydantic")


@app.function(image=fastapi_image, timeout=600)
@modal.concurrent(max_inputs=100)
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
