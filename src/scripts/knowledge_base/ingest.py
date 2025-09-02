#!/usr/bin/env python3
"""
Automated Regulatory Knowledge Base Ingestion
Complete ingestion pipeline that processes all chunks in one run
"""

import json
import logging
import asyncio
import time
import os
import sys
import uuid
import hashlib
from pathlib import Path
from typing import List, Dict, Any
from dataclasses import dataclass
import httpx

# Load environment variables FIRST
try:
    from dotenv import load_dotenv
    # Go up 4 levels from this file to reach project root
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
    """Convert string to deterministic UUID using SHA256 hash"""
    # Create a deterministic UUID from the string using namespace UUID
    namespace = uuid.UUID('12345678-1234-5678-1234-123456789abc')  # Fixed namespace
    return str(uuid.uuid5(namespace, text))

class RegulatoryKnowledgeIngestion:
    """Complete regulatory knowledge base ingestion service"""
    
    def __init__(self):
        # Configuration
        self.collection_name = "regulatory_kb"  # CRITICAL: Separate from user documents
        self.vector_size = 2560  # Qwen3-4B actual embedding dimensions
        self.batch_size = 32
        
        # Load configuration from environment
        self.qdrant_url = os.getenv('QDRANT_URL')
        self.qdrant_api_key = os.getenv('QDRANT_API_KEY')
        self.embedding_endpoint = os.getenv('EMBEDDING_ENDPOINT_URL', 'https://litellm.eks.kopi.io/v1')
        self.embedding_model = os.getenv('EMBEDDING_MODEL_ID', 'openai/qwen3-embedding-4b-bf16-cpu')
        self.embedding_api_key = os.getenv('EMBEDDING_API_KEY')
        
        # Validate environment
        if not all([self.qdrant_url, self.qdrant_api_key, self.embedding_api_key]):
            raise ValueError("Missing required environment variables: QDRANT_URL, QDRANT_API_KEY, EMBEDDING_API_KEY")
        
        # Initialize clients
        self.qdrant_client = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
        )
        
        self.embedding_client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0),
            headers={
                'Authorization': f'Bearer {self.embedding_api_key}',
                'Content-Type': 'application/json'
            }
        )
        
        self.setup_logging()
    
    def setup_logging(self):
        """Configure logging"""
        # Ensure output directory exists
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
        """Create regulatory_kb collection if it doesn't exist"""
        try:
            # Check if collection exists
            collection_info = self.qdrant_client.get_collection(self.collection_name)
            logging.info(f"📦 Collection '{self.collection_name}' already exists")
        except Exception:
            # Create new collection
            logging.info(f"📦 Creating collection '{self.collection_name}' with {self.vector_size}D vectors")
            
            self.qdrant_client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE
                )
            )
            
            # Create payload indexes for efficient filtering
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
                    logging.warning(f"⚠️  Failed to create index for {field_name}: {e}")
            
            logging.info(f"✅ Collection '{self.collection_name}' created successfully")
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using configured endpoint"""
        try:
            response = await self.embedding_client.post(
                f"{self.embedding_endpoint}/embeddings",
                json={
                    "model": self.embedding_model,
                    "input": text
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                return result['data'][0]['embedding']
            else:
                raise Exception(f"Embedding generation failed: HTTP {response.status_code}")
                
        except Exception as e:
            logging.error(f"❌ Embedding generation error: {e}")
            raise
    
    async def ingest_all_chunks(self, chunks: List[Dict[str, Any]]) -> IngestionResult:
        """Automated ingestion of all chunks in batches"""
        start_time = time.time()
        
        logging.info(f"🚀 Starting automated ingestion of {len(chunks)} regulatory chunks into '{self.collection_name}' collection")
        
        successful_ingestions = 0
        failed_ingestions = 0
        
        # Process all chunks in batches
        total_batches = (len(chunks) + self.batch_size - 1) // self.batch_size
        
        for i in range(0, len(chunks), self.batch_size):
            batch = chunks[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            
            logging.info(f"📦 Processing batch {batch_num}/{total_batches} ({len(batch)} chunks)")
            
            try:
                # Generate embeddings for the batch
                batch_embeddings = []
                for chunk in batch:
                    embedding = await self.generate_embedding(chunk['text'])
                    batch_embeddings.append(embedding)
                
                # Prepare points for Qdrant
                points = []
                for j, (chunk, embedding) in enumerate(zip(batch, batch_embeddings)):
                    chunk_id = chunk.get('id')
                    if not chunk_id:
                        logging.warning(f"⚠️ Skipping chunk in batch {batch_num} due to missing ID. Chunk data: {str(chunk)[:200]}...")
                        failed_ingestions += 1
                        continue
                    
                    # Convert string ID to UUID for Qdrant compatibility
                    qdrant_id = string_to_uuid(chunk_id)
                    
                    point = PointStruct(
                        id=qdrant_id,  # Use UUID-converted persistent ID
                        vector=embedding,
                        payload={
                            "chunk_id": chunk.get('id', ''),
                            "text": chunk.get('text', ''),
                            "metadata": chunk.get('metadata', {}),
                            "source_document": chunk.get('source_document', {}),
                            "processing_info": chunk.get('processing_info', {}),
                            # Flatten key metadata for efficient filtering
                            "country": chunk.get('metadata', {}).get('country', ''),
                            "tax_type": chunk.get('metadata', {}).get('tax_type', ''),
                            "topics": chunk.get('metadata', {}).get('topics', []),
                            "document_version": chunk.get('metadata', {}).get('document_version', ''),
                            "language": chunk.get('metadata', {}).get('language', ''),
                            "source_name": chunk.get('metadata', {}).get('source_name', ''),
                        }
                    )
                    points.append(point)
                
                # Upload batch to Qdrant
                self.qdrant_client.upsert(
                    collection_name=self.collection_name,
                    points=points
                )
                
                successful_ingestions += len(batch)
                logging.info(f"✅ Batch {batch_num} completed ({len(batch)} chunks)")
                
            except Exception as e:
                error_msg = f"Batch {batch_num} failed: {str(e)}"
                logging.error(error_msg)
                failed_ingestions += len(batch)
            
            # Progress update
            progress = (i + len(batch)) / len(chunks) * 100
            logging.info(f"📊 Progress: {progress:.1f}% ({successful_ingestions} success, {failed_ingestions} failed)")
            
            # Small delay between batches
            if i + self.batch_size < len(chunks):
                await asyncio.sleep(0.1)
        
        processing_time = time.time() - start_time
        
        result = IngestionResult(
            total_chunks=len(chunks),
            successful_ingestions=successful_ingestions,
            failed_ingestions=failed_ingestions,
            processing_time=processing_time
        )
        
        # Final summary
        logging.info(f"✅ Ingestion completed in {processing_time:.2f} seconds")
        logging.info(f"📊 Results: {successful_ingestions}/{len(chunks)} successful ({successful_ingestions/len(chunks)*100:.1f}%)")
        
        return result
    
    async def run_complete_ingestion(self) -> IngestionResult:
        """Execute complete automated ingestion pipeline"""
        try:
            # 1. Load all processed chunks
            chunks = self.load_processed_chunks()
            
            # 2. Ensure collection exists
            await self.ensure_collection_exists()
            
            # 3. Ingest all chunks automatically
            result = await self.ingest_all_chunks(chunks)
            
            return result
            
        except Exception as e:
            logging.error(f"❌ Complete ingestion failed: {e}")
            raise
        finally:
            await self.embedding_client.aclose()

async def main():
    """Main entry point for automated regulatory KB ingestion"""
    try:
        # Initialize ingestion service
        ingestion = RegulatoryKnowledgeIngestion()
        
        # Run complete ingestion pipeline
        result = await ingestion.run_complete_ingestion()
        
        # Display final results
        print(f"\n🎉 Regulatory Knowledge Base Ingestion Complete!")
        print(f"📊 Successfully ingested {result.successful_ingestions} chunks into the regulatory_kb collection.")
        print(f"⏱️  Total processing time: {result.processing_time:.2f} seconds")
        print(f"📄 Collection name: regulatory_kb")
        
        if result.failed_ingestions > 0:
            print(f"⚠️  {result.failed_ingestions} chunks failed to ingest (check output/ingestion.log)")
        else:
            print(f"✅ All {result.total_chunks} chunks ingested successfully!")
        
        return result.successful_ingestions > 0
        
    except Exception as e:
        print(f"\n❌ Ingestion failed: {e}")
        print(f"Check output/ingestion.log for detailed error information")
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
