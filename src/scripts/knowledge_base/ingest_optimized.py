#!/usr/bin/env python3
"""
OPTIMIZED Regulatory Knowledge Base Ingestion
Critical performance fix: Concurrent embedding generation using asyncio.gather()
Expected performance improvement: Up to 32x faster!
"""

import json
import logging
import asyncio
import time
import os
import sys
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import httpx

# Load environment variables FIRST
try:
    from dotenv import load_dotenv
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    env_path = project_root / '.env.local'
    
    if env_path.exists():
        load_dotenv(env_path, verbose=False)
    else:
        print(f"Warning: .env.local file not found at {env_path}")
except ImportError:
    print("Warning: python-dotenv not found, using system environment")

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams, PointStruct
    from qdrant_client.http import models
except ImportError:
    print("Error: qdrant-client not installed. Run: pip install qdrant-client")
    sys.exit(1)

@dataclass
class IngestionResult:
    """Results from the vector ingestion process"""
    total_chunks: int
    successful_ingestions: int
    failed_ingestions: int
    processing_time: float

def string_to_uuid(text: str) -> str:
    """Convert string to deterministic UUID using a fixed namespace"""
    namespace = uuid.UUID('12345678-1234-5678-1234-123456789abc')
    return str(uuid.uuid5(namespace, text))

class RegulatoryKnowledgeIngestion:
    """OPTIMIZED regulatory knowledge base ingestion service with concurrent processing"""
    
    def __init__(self):
        # Configuration
        self.collection_name = "regulatory_kb"
        self.vector_size = 2560
        self.batch_size = 32
        self.max_concurrent_requests = 32  # NEW: Control concurrency level
        self.retry_attempts = 3  # NEW: Retry failed requests
        
        # Load environment configuration
        self.qdrant_url = os.getenv('QDRANT_URL')
        self.qdrant_api_key = os.getenv('QDRANT_API_KEY')
        self.embedding_endpoint = os.getenv('EMBEDDING_ENDPOINT_URL', 'https://litellm.eks.kopi.io/v1')
        self.embedding_model = os.getenv('EMBEDDING_MODEL_ID', 'openai/qwen3-embedding-4b-bf16-cpu')
        self.embedding_api_key = os.getenv('EMBEDDING_API_KEY')
        
        # Validate environment
        if not all([self.qdrant_url, self.qdrant_api_key, self.embedding_api_key]):
            raise ValueError("Missing required environment variables: QDRANT_URL, QDRANT_API_KEY, EMBEDDING_API_KEY")
        
        # Initialize clients with optimized settings
        self.qdrant_client = QdrantClient(url=self.qdrant_url, api_key=self.qdrant_api_key)
        
        # OPTIMIZED: Configure httpx client with connection limits
        self.embedding_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
            headers={
                'Authorization': f'Bearer {self.embedding_api_key}',
                'Content-Type': 'application/json'
            }
        )
        self.setup_logging()
    
    def setup_logging(self):
        """Configure logging"""
        Path("output").mkdir(exist_ok=True)
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('output/ingestion_optimized.log'),
                logging.StreamHandler(sys.stdout)
            ]
        )
    
    def load_processed_chunks(self) -> List[Dict[str, Any]]:
        """Load all processed chunks from JSON file"""
        chunks_file = "output/processed_chunks.json"
        if not Path(chunks_file).exists():
            raise FileNotFoundError(f"Processed chunks file not found: {chunks_file}")
        with open(chunks_file, 'r', encoding='utf-8') as f:
            chunks = json.load(f)
        logging.info(f"📂 Loaded {len(chunks)} processed chunks")
        return chunks
    
    async def ensure_collection_exists(self):
        """Create regulatory_kb collection if it doesn't exist"""
        try:
            self.qdrant_client.get_collection(self.collection_name)
            logging.info(f"📦 Collection '{self.collection_name}' already exists")
        except Exception:
            logging.info(f"📦 Creating collection '{self.collection_name}' with {self.vector_size}D vectors")
            self.qdrant_client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE)
            )
            payload_indexes = [
                ("country", models.PayloadSchemaType.KEYWORD),
                ("tax_type", models.PayloadSchemaType.KEYWORD),
                ("topics", models.PayloadSchemaType.KEYWORD),
                ("document_version", models.PayloadSchemaType.KEYWORD),
                ("language", models.PayloadSchemaType.KEYWORD),
            ]
            for field_name, field_type in payload_indexes:
                try:
                    self.qdrant_client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name=field_name,
                        field_schema=field_type
                    )
                except Exception as e:
                    logging.warning(f"⚠️ Failed to create index for {field_name}: {e}")
            logging.info(f"✅ Collection '{self.collection_name}' created successfully")
    
    async def generate_embedding_with_retry(self, text: str, chunk_id: str = "") -> Optional[List[float]]:
        """Generate embedding with retry logic and error handling"""
        for attempt in range(self.retry_attempts):
            try:
                response = await self.embedding_client.post(
                    f"{self.embedding_endpoint}/embeddings",
                    json={"model": self.embedding_model, "input": text}
                )
                response.raise_for_status()
                result = response.json()
                return result['data'][0]['embedding']
            except Exception as e:
                if attempt < self.retry_attempts - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logging.warning(f"⚠️ Embedding attempt {attempt + 1} failed for chunk {chunk_id}, retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                else:
                    logging.error(f"❌ Final embedding attempt failed for chunk {chunk_id}: {e}")
                    return None
        return None
    
    async def ingest_all_chunks(self, chunks: List[Dict[str, Any]]) -> IngestionResult:
        """OPTIMIZED: Concurrent embedding generation with asyncio.gather()"""
        start_time = time.time()
        logging.info(f"🚀 Starting OPTIMIZED ingestion of {len(chunks)} regulatory chunks")
        logging.info(f"⚡ Using concurrent processing with up to {self.max_concurrent_requests} parallel requests")
        
        successful_ingestions = 0
        failed_ingestions = 0
        total_batches = (len(chunks) + self.batch_size - 1) // self.batch_size
        
        for i in range(0, len(chunks), self.batch_size):
            batch = chunks[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            batch_start_time = time.time()
            
            logging.info(f"📦 Processing batch {batch_num}/{total_batches} ({len(batch)} chunks)")
            
            try:
                # 🚀 CRITICAL PERFORMANCE FIX: Concurrent embedding generation
                logging.info(f"⚡ Generating {len(batch)} embeddings concurrently...")
                
                # Create all embedding tasks at once
                embedding_tasks = [
                    self.generate_embedding_with_retry(chunk['text'], chunk.get('id', f'batch_{batch_num}_chunk_{j}'))
                    for j, chunk in enumerate(batch)
                ]
                
                # Execute ALL tasks concurrently - this is the key optimization!
                batch_embeddings = await asyncio.gather(*embedding_tasks, return_exceptions=True)
                
                # Process results and handle any failures
                points = []
                batch_successes = 0
                batch_failures = 0
                
                for j, (chunk, embedding) in enumerate(zip(batch, batch_embeddings)):
                    # Handle failed embeddings gracefully
                    if embedding is None or isinstance(embedding, Exception):
                        logging.warning(f"⚠️ Skipping chunk {j} in batch {batch_num} due to embedding failure")
                        batch_failures += 1
                        continue

                    chunk_id = chunk.get('id')
                    if not chunk_id:
                        logging.warning(f"⚠️ Skipping chunk {j} in batch {batch_num} due to missing ID")
                        batch_failures += 1
                        continue
                    
                    point = PointStruct(
                        id=string_to_uuid(chunk_id),
                        vector=embedding,
                        payload={
                            "chunk_id": chunk.get('id', ''),
                            "text": chunk.get('text', ''),
                            "metadata": chunk.get('metadata', {}),
                            "source_document": chunk.get('source_document', {}),
                            "processing_info": chunk.get('processing_info', {}),
                            "country": chunk.get('metadata', {}).get('country', ''),
                            "tax_type": chunk.get('metadata', {}).get('tax_type', ''),
                            "topics": chunk.get('metadata', {}).get('topics', []),
                            "document_version": chunk.get('metadata', {}).get('document_version', ''),
                            "language": chunk.get('metadata', {}).get('language', ''),
                            "source_name": chunk.get('metadata', {}).get('source_name', ''),
                        }
                    )
                    points.append(point)
                    batch_successes += 1
                
                # Upload successful points to Qdrant
                if points:
                    self.qdrant_client.upsert(collection_name=self.collection_name, points=points)
                    successful_ingestions += batch_successes
                    
                failed_ingestions += batch_failures
                batch_time = time.time() - batch_start_time
                
                logging.info(f"✅ Batch {batch_num} completed in {batch_time:.2f}s ({batch_successes} success, {batch_failures} failed)")
                
            except Exception as e:
                batch_time = time.time() - batch_start_time
                error_msg = f"❌ Batch {batch_num} failed catastrophically in {batch_time:.2f}s: {str(e)}"
                logging.error(error_msg, exc_info=True)
                failed_ingestions += len(batch)
            
            # Progress update with time estimates
            progress = (i + len(batch)) / len(chunks) * 100
            elapsed_time = time.time() - start_time
            if progress > 0:
                estimated_total_time = elapsed_time / (progress / 100)
                remaining_time = estimated_total_time - elapsed_time
                logging.info(f"📊 Progress: {progress:.1f}% ({successful_ingestions} success, {failed_ingestions} failed)")
                logging.info(f"⏱️ Elapsed: {elapsed_time:.1f}s, Estimated remaining: {remaining_time:.1f}s")
        
        processing_time = time.time() - start_time
        return IngestionResult(len(chunks), successful_ingestions, failed_ingestions, processing_time)
    
    async def run_complete_ingestion(self) -> IngestionResult:
        """Execute complete optimized ingestion pipeline"""
        try:
            chunks = self.load_processed_chunks()
            await self.ensure_collection_exists()
            result = await self.ingest_all_chunks(chunks)
            return result
        except Exception as e:
            logging.error(f"❌ Complete ingestion failed: {e}")
            raise
        finally:
            await self.embedding_client.aclose()

async def main():
    """Main entry point for optimized regulatory KB ingestion"""
    try:
        ingestion = RegulatoryKnowledgeIngestion()
        result = await ingestion.run_complete_ingestion()
        
        # Performance metrics
        chunks_per_second = result.successful_ingestions / result.processing_time if result.processing_time > 0 else 0
        
        print(f"\n🎉 OPTIMIZED Regulatory Knowledge Base Ingestion Complete!")
        print(f"📊 Successfully ingested {result.successful_ingestions} chunks into the regulatory_kb collection")
        print(f"⏱️ Total processing time: {result.processing_time:.2f} seconds")
        print(f"🚀 Performance: {chunks_per_second:.2f} chunks/second")
        print(f"📄 Collection name: regulatory_kb")
        
        if result.failed_ingestions > 0:
            print(f"⚠️ {result.failed_ingestions} chunks failed to ingest (check output/ingestion_optimized.log)")
        else:
            print(f"✅ All {result.total_chunks} chunks ingested successfully!")
        
        return result.successful_ingestions > 0
    except Exception as e:
        print(f"\n❌ Optimized ingestion failed: {e}")
        print(f"Check output/ingestion_optimized.log for detailed error information")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)