#!/usr/bin/env python3
"""
Clear regulatory_kb collection and reingest improved chunks
"""

import os
import sys
import json
import logging
import asyncio
import httpx
from pathlib import Path

# Load environment variables FIRST
try:
    from dotenv import load_dotenv
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    env_path = project_root / '.env.local'
    
    if env_path.exists():
        load_dotenv(env_path, verbose=False)
        print(f"✅ Loaded environment from {env_path}")
    else:
        print(f"Warning: .env.local file not found at {env_path}")
except ImportError:
    print("Warning: python-dotenv not found, using system environment")

# Configuration
QDRANT_URL = os.getenv('QDRANT_URL', "https://d42bb738-ad79-45dc-b2c2-28267777e4da.us-west-1-0.aws.cloud.qdrant.io:6333")
QDRANT_API_KEY = os.getenv('QDRANT_API_KEY')
COLLECTION_NAME = "regulatory_kb"

async def clear_collection():
    """Clear the regulatory_kb collection"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Delete the collection
            print(f"🗑️  Deleting collection '{COLLECTION_NAME}'...")
            response = await client.delete(
                f"{QDRANT_URL}/collections/{COLLECTION_NAME}",
                headers={"api-key": QDRANT_API_KEY}
            )
            
            if response.status_code == 200:
                print(f"✅ Collection '{COLLECTION_NAME}' deleted successfully")
                return True
            else:
                print(f"❌ Failed to delete collection: {response.status_code} {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ Error clearing collection: {e}")
        return False

async def main():
    """Main execution"""
    if not QDRANT_API_KEY:
        print("❌ QDRANT_API_KEY environment variable not found")
        sys.exit(1)
    
    print("🚀 Starting collection clearing and reingestion...")
    
    # Step 1: Clear old collection
    if not await clear_collection():
        print("❌ Failed to clear collection")
        sys.exit(1)
    
    # Step 2: Run ingestion
    print("🔄 Starting fresh ingestion with improved chunks...")
    import subprocess
    result = subprocess.run([sys.executable, "ingest.py"], capture_output=True, text=True)
    
    if result.returncode == 0:
        print("✅ Ingestion completed successfully!")
        print(result.stdout)
    else:
        print("❌ Ingestion failed:")
        print(result.stderr)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())