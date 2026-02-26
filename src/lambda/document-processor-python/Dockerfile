# Lambda Container Image for Document Processing with AWS Durable Functions
#
# This container includes:
# - Python 3.11 runtime
# - AWS Durable Execution SDK for fault-tolerant workflows
# - DSPy for structured LLM extraction with Gemini
# - Poppler for PDF to image conversion
# - OpenCV for QR code detection (pre-built headless wheel)
# - Sentry for error tracking
#
# Build:
#   docker build -t finanseal-document-processor .
#
# Test locally:
#   docker run -p 9000:8080 finanseal-document-processor
#   curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"test": true}'

FROM public.ecr.aws/lambda/python:3.11

# Install Poppler for PDF conversion (as root)
USER root
RUN yum install -y poppler-utils && yum clean all

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/

# Upgrade pip to ensure it can find pre-built wheels
RUN pip install --upgrade pip

# Install Python packages, using pre-built wheels for packages with native extensions
# to avoid needing Rust compiler (tiktoken) or C compiler (numpy)
RUN pip install --no-cache-dir \
    --only-binary=numpy,tiktoken,opencv-python-headless \
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
