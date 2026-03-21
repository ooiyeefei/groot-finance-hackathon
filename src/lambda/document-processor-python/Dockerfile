# Lambda Container Image for Document Processing
#
# This container includes:
# - Python 3.11 runtime
# - DSPy for structured LLM extraction with Gemini
# - Poppler for PDF to image conversion
# - zxing-cpp for QR code detection (pure wheel, zero system deps)
# - pyzbar + libzbar for robust QR fallback (smooth+upscale rescue)
# - Sentry for error tracking

FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies (as root)
USER root
RUN yum install -y \
    poppler-utils \
    && yum clean all

# Install libzbar shared library (pre-built for Amazon Linux 2 x86_64)
# pyzbar uses ctypes.util.find_library('zbar') which needs ldconfig cache
COPY libzbar.so.0 /usr/lib64/libzbar.so.0
RUN ln -sf /usr/lib64/libzbar.so.0 /usr/lib64/libzbar.so \
    && echo "/usr/lib64" > /etc/ld.so.conf.d/zbar.conf \
    && /sbin/ldconfig

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/

# Upgrade pip to ensure it can find pre-built wheels
RUN pip install --upgrade pip

# Install Python packages — pre-built wheels for native extensions
RUN pip install --no-cache-dir \
    --only-binary=numpy,tiktoken,zxing-cpp,pillow-heif,pyzbar \
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
