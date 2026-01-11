"""
S3 Client for Python Lambda

Provides S3 operations for document storage including:
- Reading original documents
- Writing converted images
- Generating presigned URLs for image access
"""

import io
import os
from typing import List, Optional, Tuple
from dataclasses import dataclass

import boto3
from botocore.config import Config


@dataclass
class ConvertedImageInfo:
    """Information about a converted image."""
    page_number: int
    s3_key: str
    width: int
    height: int
    mime_type: str = "image/png"


class S3Client:
    """S3 client for document storage operations."""

    def __init__(
        self,
        bucket: str,
        region: str = "us-west-2",
        presign_expiration: int = 3600,
    ):
        """
        Initialize S3 client.

        Args:
            bucket: S3 bucket name
            region: AWS region
            presign_expiration: Presigned URL expiration in seconds
        """
        self.bucket = bucket
        self.region = region
        self.presign_expiration = presign_expiration

        # Configure client with retries
        config = Config(
            region_name=region,
            retries={"max_attempts": 3, "mode": "adaptive"},
        )
        self._client = boto3.client("s3", config=config)

    def read_document(self, s3_key: str) -> bytes:
        """
        Read document content from S3.

        Args:
            s3_key: S3 object key

        Returns:
            Document bytes

        Raises:
            S3Error: If read fails
        """
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=s3_key)
            return response["Body"].read()
        except Exception as e:
            raise S3Error(f"Failed to read {s3_key}: {str(e)}")

    def write_image(
        self,
        s3_key: str,
        image_bytes: bytes,
        content_type: str = "image/png",
    ) -> str:
        """
        Write image to S3.

        Args:
            s3_key: S3 object key
            image_bytes: Image data
            content_type: MIME type

        Returns:
            S3 key of written object

        Raises:
            S3Error: If write fails
        """
        try:
            self._client.put_object(
                Bucket=self.bucket,
                Key=s3_key,
                Body=image_bytes,
                ContentType=content_type,
            )
            return s3_key
        except Exception as e:
            raise S3Error(f"Failed to write {s3_key}: {str(e)}")

    def get_presigned_url(self, s3_key: str, expiration: Optional[int] = None) -> str:
        """
        Generate presigned URL for reading an S3 object.

        Args:
            s3_key: S3 object key
            expiration: URL expiration in seconds (default: instance presign_expiration)

        Returns:
            Presigned URL

        Raises:
            S3Error: If URL generation fails
        """
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": s3_key},
                ExpiresIn=expiration or self.presign_expiration,
            )
        except Exception as e:
            raise S3Error(f"Failed to generate presigned URL for {s3_key}: {str(e)}")

    def get_presigned_urls_for_images(
        self,
        images: List[ConvertedImageInfo],
    ) -> List[str]:
        """
        Generate presigned URLs for converted images.

        Args:
            images: List of converted image info

        Returns:
            List of presigned URLs
        """
        return [self.get_presigned_url(img.s3_key) for img in images]

    def build_storage_path(
        self,
        domain: str,
        business_id: str,
        user_id: str,
        document_id: str,
        stage: str,
        filename: str,
    ) -> str:
        """
        Build standardized S3 storage path (full S3 key).

        Pattern: {domain}/{business_id}/{user_id}/{document_id}/{stage}/{filename}

        This creates the complete S3 key including the domain prefix.
        Used by Lambda when writing converted images directly to S3.

        Aligned with TypeScript pattern:
        - TypeScript storage path (Convex): {bid}/{uid}/{docId}/{stage}/{filename}
        - TypeScript S3 key: {domain}/{bid}/{uid}/{docId}/{stage}/{filename}
        - Lambda S3 key: same as TypeScript S3 key

        Args:
            domain: 'invoices' or 'expense_claims'
            business_id: Business ID (Convex ID)
            user_id: User ID (Convex ID)
            document_id: Document ID (Convex ID)
            stage: Processing stage ('raw', 'converted', 'processed')
            filename: File name (e.g., 'page_1.png')

        Returns:
            Full S3 key path
        """
        return f"{domain}/{business_id}/{user_id}/{document_id}/{stage}/{filename}"

    def write_converted_images(
        self,
        images: List[Tuple[bytes, int, int]],
        document_id: str,
        domain: str,
        storage_path: str,
    ) -> List[ConvertedImageInfo]:
        """
        Write converted PDF page images to S3.

        Args:
            images: List of (image_bytes, width, height) tuples
            document_id: Document ID
            domain: 'invoices' or 'expense_claims'
            storage_path: Original storage path (for path construction)

        Returns:
            List of ConvertedImageInfo for each written image
        """
        results = []

        for page_num, (img_bytes, width, height) in enumerate(images, start=1):
            # Extract path components from original storage path
            # Format: {business_id}/{user_id}/{document_id}/raw/{filename}
            # Note: storage_path from Convex doesn't include domain prefix
            path_parts = storage_path.split("/")

            if len(path_parts) >= 3:
                business_id = path_parts[0]
                user_id = path_parts[1]
            else:
                business_id = "unknown"
                user_id = "unknown"

            # Build S3 key for converted image
            filename = f"page_{page_num}.png"
            s3_key = self.build_storage_path(
                domain=domain,
                business_id=business_id,
                user_id=user_id,
                document_id=document_id,
                stage="converted",
                filename=filename,
            )

            # Write to S3
            self.write_image(s3_key, img_bytes, "image/png")

            results.append(ConvertedImageInfo(
                page_number=page_num,
                s3_key=s3_key,
                width=width,
                height=height,
                mime_type="image/png",
            ))

        return results

    def get_full_s3_key(self, storage_path: str, domain: str) -> str:
        """
        Build full S3 key from storage path and domain.

        The storage_path from Convex typically doesn't include the domain prefix.
        This method prepends the domain to create the full S3 key.

        Args:
            storage_path: Path without domain prefix
            domain: 'invoices' or 'expense_claims'

        Returns:
            Full S3 key with domain prefix
        """
        return f"{domain}/{storage_path}"

    def object_exists(self, s3_key: str) -> bool:
        """
        Check if an S3 object exists.

        Args:
            s3_key: S3 object key

        Returns:
            True if object exists
        """
        try:
            self._client.head_object(Bucket=self.bucket, Key=s3_key)
            return True
        except:
            return False


class S3Error(Exception):
    """Error from S3 operations."""
    pass
