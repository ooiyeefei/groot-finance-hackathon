#!/usr/bin/env python3
"""
PROPERLY FIXED Regulatory Knowledge Base Ingestion
SOLUTION: Controlled concurrency using asyncio.Semaphore to avoid overwhelming the endpoint
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
    project_root = Path(__file__).resolve().parent.parent.parent
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
    """FIXED regulatory knowledge base ingestion with controlled concurrency"""
    
    def __init__(self, recreate_collection: bool = False):
        # Configuration
        self.collection_name = "regulatory_kb"
        self.vector_size = 3072  # Gemini gemini-embedding-001 default dimension
        self.batch_size = 16  # Efficient batch size for good performance
        self.max_concurrent_requests = 4  # Optimal concurrent requests for throughput
        self.retry_attempts = 3
        self.recreate_collection = recreate_collection

        # Load environment configuration
        self.qdrant_url = os.getenv('QDRANT_URL')
        self.qdrant_api_key = os.getenv('QDRANT_API_KEY')
        self.embedding_endpoint = os.getenv('EMBEDDING_ENDPOINT_URL', 'https://generativelanguage.googleapis.com/v1beta/openai')
        self.embedding_model = os.getenv('EMBEDDING_MODEL_ID', 'gemini-embedding-001')
        self.embedding_api_key = os.getenv('EMBEDDING_API_KEY')
        
        # Validate environment
        if not all([self.qdrant_url, self.qdrant_api_key, self.embedding_api_key]):
            raise ValueError("Missing required environment variables: QDRANT_URL, QDRANT_API_KEY, EMBEDDING_API_KEY")
        
        # Initialize clients
        self.qdrant_client = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
            timeout=60.0
        )
        
        # FIXED: More conservative HTTP client settings
        self.embedding_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0),  # Reasonable 2-minute timeout for embedding service
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            headers={
                'Authorization': f'Bearer {self.embedding_api_key}',
                'Content-Type': 'application/json'
            }
        )
        
        # CRITICAL FIX: Semaphore to control concurrent requests
        self.semaphore = asyncio.Semaphore(self.max_concurrent_requests)
        
        self.setup_logging()
    
    def setup_logging(self):
        """Configure logging"""
        Path("output").mkdir(exist_ok=True)
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('output/ingestion.log'),
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
        """Create regulatory_kb collection if it doesn't exist, or recreate if requested"""
        try:
            collection_info = self.qdrant_client.get_collection(self.collection_name)
            existing_size = collection_info.config.params.vectors.size
            if self.recreate_collection or existing_size != self.vector_size:
                reason = "explicitly requested" if self.recreate_collection else f"vector size mismatch ({existing_size} != {self.vector_size})"
                logging.info(f"🔄 Deleting collection '{self.collection_name}' ({reason})")
                self.qdrant_client.delete_collection(self.collection_name)
                raise Exception("Recreating collection")
            logging.info(f"📦 Collection '{self.collection_name}' already exists ({existing_size}D vectors)")
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
    
    async def generate_embedding_controlled(self, text: str, chunk_id: str = "") -> Optional[List[float]]:
        """Generate embedding with CONTROLLED concurrency using semaphore"""
        async with self.semaphore:  # CRITICAL: This limits concurrent requests
            for attempt in range(self.retry_attempts):
                try:
                    # Add small jitter to avoid thundering herd
                    if attempt > 0:
                        jitter = 0.5 + (attempt * 0.3)  # 0.5s, 0.8s, 1.1s delays
                        await asyncio.sleep(jitter)
                    
                    response = await self.embedding_client.post(
                        f"{self.embedding_endpoint}/embeddings",
                        json={"model": self.embedding_model, "input": text}
                    )
                    response.raise_for_status()
                    result = response.json()
                    return result['data'][0]['embedding']
                    
                except Exception as e:
                    if attempt < self.retry_attempts - 1:
                        wait_time = 2 ** attempt + 1  # 1s, 3s, 7s exponential backoff
                        logging.warning(f"⚠️ Embedding attempt {attempt + 1} failed for chunk {chunk_id[:20]}..., retrying in {wait_time}s: {str(e)[:100]}")
                        await asyncio.sleep(wait_time)
                    else:
                        logging.error(f"❌ All embedding attempts failed for chunk {chunk_id[:20]}...: {str(e)[:100]}")
                        return None
            return None
    
    async def ingest_all_chunks(self, chunks: List[Dict[str, Any]]) -> IngestionResult:
        """FIXED: Controlled concurrent embedding generation with proper throttling"""
        start_time = time.time()
        logging.info(f"🚀 Starting FIXED ingestion of {len(chunks)} regulatory chunks")
        logging.info(f"⚡ Using controlled concurrency: max {self.max_concurrent_requests} parallel requests")
        logging.info(f"📦 Batch size: {self.batch_size} chunks per batch")
        
        successful_ingestions = 0
        failed_ingestions = 0
        total_batches = (len(chunks) + self.batch_size - 1) // self.batch_size
        
        for i in range(0, len(chunks), self.batch_size):
            batch = chunks[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            batch_start_time = time.time()
            
            logging.info(f"📦 Processing batch {batch_num}/{total_batches} ({len(batch)} chunks)")
            
            try:
                # FIXED: Controlled concurrent embedding generation with semaphore
                logging.info(f"⚡ Generating {len(batch)} embeddings with max {self.max_concurrent_requests} concurrent requests...")
                
                # Create controlled embedding tasks
                embedding_tasks = [
                    self.generate_embedding_controlled(chunk['text'], chunk.get('id', f'batch_{batch_num}_chunk_{j}'))
                    for j, chunk in enumerate(batch)
                ]
                
                # Execute with controlled concurrency (semaphore limits actual concurrency)
                batch_embeddings = await asyncio.gather(*embedding_tasks, return_exceptions=True)
                
                # Process results
                points = []
                batch_successes = 0
                batch_failures = 0
                
                for j, (chunk, embedding) in enumerate(zip(batch, batch_embeddings)):
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
                
                # Upload successful points to Qdrant with robust retry mechanism
                if points:
                    # --- Start of Retry Logic ---
                    max_retries = 3
                    upload_successful = False
                    
                    for attempt in range(max_retries):
                        try:
                            self.qdrant_client.upsert(collection_name=self.collection_name, points=points)
                            successful_ingestions += batch_successes
                            logging.info(f"✅ Batch {batch_num} uploaded successfully on attempt {attempt + 1}")
                            upload_successful = True
                            break  # Exit loop on success
                        except Exception as e:
                            logging.warning(f"⚠️ Qdrant upload failed on attempt {attempt + 1}/{max_retries} for batch {batch_num}: {e}")
                            if attempt + 1 == max_retries:
                                # All retries exhausted, mark as failed
                                logging.error(f"❌ Batch {batch_num} failed after all retries: {str(e)}")
                                failed_ingestions += batch_successes  # Count successful embeddings as failed due to upload failure
                                break
                            else:
                                wait_time = 2 ** (attempt + 1)  # Exponential backoff: 2, 4 seconds
                                logging.info(f"Retrying in {wait_time} seconds...")
                                await asyncio.sleep(wait_time)
                    # --- End of Retry Logic ---
                else:
                    logging.warning(f"⚠️ Batch {batch_num} resulted in no points to upload.")
                    
                failed_ingestions += batch_failures
                batch_time = time.time() - batch_start_time
                
                if points and upload_successful:
                    logging.info(f"✅ Batch {batch_num} completed in {batch_time:.2f}s ({batch_successes} success, {batch_failures} failed)")
                elif points:
                    logging.error(f"❌ Batch {batch_num} failed upload in {batch_time:.2f}s ({batch_successes} embeddings generated but upload failed, {batch_failures} embedding failures)")
                else:
                    logging.warning(f"⚠️ Batch {batch_num} completed in {batch_time:.2f}s with no valid embeddings ({batch_failures} failures)")
                
                # Reasonable delay between batches for stability
                if batch_num < total_batches:
                    await asyncio.sleep(2.0)  # 2 second delay between batches
                
            except Exception as e:
                batch_time = time.time() - batch_start_time
                error_msg = f"❌ Batch {batch_num} failed catastrophically after all retries: {str(e)[:200]}"
                logging.error(error_msg, exc_info=False)  # No need for full traceback on final failure
                failed_ingestions += len(batch)  # Count all chunks in the batch as failed
            
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
        """Execute complete fixed ingestion pipeline"""
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
    """Main entry point for regulatory KB ingestion"""
    recreate = '--recreate-collection' in sys.argv
    try:
        ingestion = RegulatoryKnowledgeIngestion(recreate_collection=recreate)
        result = await ingestion.run_complete_ingestion()
        
        # Performance metrics
        chunks_per_second = result.successful_ingestions / result.processing_time if result.processing_time > 0 else 0
        
        print(f"\n🎉 FIXED Regulatory Knowledge Base Ingestion Complete!")
        print(f"📊 Successfully ingested {result.successful_ingestions} chunks into the regulatory_kb collection")
        print(f"⏱️ Total processing time: {result.processing_time:.2f} seconds")
        print(f"🚀 Performance: {chunks_per_second:.2f} chunks/second")
        print(f"📄 Collection name: regulatory_kb")
        
        if result.failed_ingestions > 0:
            print(f"⚠️ {result.failed_ingestions} chunks failed to ingest (check output/ingestion.log)")
        else:
            print(f"✅ All {result.total_chunks} chunks ingested successfully!")
        
        return result.successful_ingestions > 0
    except Exception as e:
        print(f"\n❌ Fixed ingestion failed: {e}")
        print(f"Check output/ingestion.log for detailed error information")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)