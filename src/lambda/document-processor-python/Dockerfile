# Lambda Container Image for Document Processing with AWS Durable Functions
#
# This container includes:
# - Python 3.11 runtime
# - AWS Durable Execution SDK for fault-tolerant workflows
# - DSPy for structured LLM extraction with Gemini
# - Poppler for PDF to image conversion
# - zbar for QR code detection (copied from Debian)
# - Sentry for error tracking
#
# Build:
#   docker build -t finanseal-document-processor .
#
# Test locally:
#   docker run -p 9000:8080 finanseal-document-processor
#   curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"test": true}'

# Stage 1: Get zbar shared library from Debian (not available in AL2 repos)
FROM python:3.11-slim AS zbar-builder
RUN apt-get update -qq && apt-get install -y -qq libzbar0 && rm -rf /var/lib/apt/lists/*

# Stage 2: Lambda runtime
FROM public.ecr.aws/lambda/python:3.11

# Install Poppler for PDF conversion (as root)
USER root
RUN yum install -y poppler-utils && yum clean all

# Copy zbar shared library from builder stage
COPY --from=zbar-builder /usr/lib/x86_64-linux-gnu/libzbar.so.0.3.0 /usr/lib64/libzbar.so.0.3.0
RUN ln -sf /usr/lib64/libzbar.so.0.3.0 /usr/lib64/libzbar.so.0 && \
    ln -sf /usr/lib64/libzbar.so.0.3.0 /usr/lib64/libzbar.so && \
    /sbin/ldconfig

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/

# Upgrade pip to ensure it can find pre-built wheels
RUN pip install --upgrade pip

# Install Python packages, using pre-built wheels for packages with native extensions
# to avoid needing Rust compiler (tiktoken) or C compiler (numpy)
RUN pip install --no-cache-dir \
    --only-binary=numpy,tiktoken \
    -r requirements.txt

# Copy function code
COPY handler.py ${LAMBDA_TASK_ROOT}/
COPY types_def.py ${LAMBDA_TASK_ROOT}/
COPY steps/ ${LAMBDA_TASK_ROOT}/steps/
COPY utils/ ${LAMBDA_TASK_ROOT}/utils/

# Set environment variables for Poppler
ENV POPPLER_PATH=/usr/bin

# Set the handler
CMD [ "handler.handler" ]
