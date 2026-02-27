# Lambda Container Image for Document Processing with AWS Durable Functions
#
# This container includes:
# - Python 3.11 runtime
# - AWS Durable Execution SDK for fault-tolerant workflows
# - DSPy for structured LLM extraction with Gemini
# - Poppler for PDF to image conversion
# - zbar + pyzbar for QR code detection (from AL2 EPEL)
# - Sentry for error tracking
#
# Build:
#   docker build -t finanseal-document-processor .
#
# Test locally:
#   docker run -p 9000:8080 finanseal-document-processor
#   curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"test": true}'

# Stage 1: Build zbar from AmazonLinux:2 EPEL (same glibc as Lambda image)
FROM amazonlinux:2 AS zbar-builder
RUN amazon-linux-extras install epel -y && \
    yum install -y zbar && \
    yum clean all

# Stage 2: Lambda runtime
FROM public.ecr.aws/lambda/python:3.11

# Install Poppler for PDF conversion (as root)
USER root
RUN yum install -y poppler-utils && yum clean all

# Copy zbar + ALL dependencies from AL2 builder (same glibc — no compatibility issues)
# zbar core + video/jpeg deps
COPY --from=zbar-builder /usr/lib64/libzbar.so.0.2.0 /usr/lib64/libzbar.so.0.2.0
COPY --from=zbar-builder /usr/lib64/libv4l2.so.0.0.0 /usr/lib64/libv4l2.so.0.0.0
COPY --from=zbar-builder /usr/lib64/libv4lconvert.so.0.0.0 /usr/lib64/libv4lconvert.so.0.0.0
COPY --from=zbar-builder /usr/lib64/libjpeg.so.62.3.0 /usr/lib64/libjpeg.so.62.3.0
# X11 deps (AL2 EPEL zbar is compiled with X11 support)
COPY --from=zbar-builder /lib64/libSM.so.6.0.1 /usr/lib64/libSM.so.6.0.1
COPY --from=zbar-builder /lib64/libICE.so.6.3.0 /usr/lib64/libICE.so.6.3.0
COPY --from=zbar-builder /lib64/libX11.so.6.3.0 /usr/lib64/libX11.so.6.3.0
COPY --from=zbar-builder /lib64/libXau.so.6.0.0 /usr/lib64/libXau.so.6.0.0
COPY --from=zbar-builder /lib64/libXext.so.6.4.0 /usr/lib64/libXext.so.6.4.0
COPY --from=zbar-builder /lib64/libXv.so.1.0.0 /usr/lib64/libXv.so.1.0.0
COPY --from=zbar-builder /lib64/libxcb.so.1.1.0 /usr/lib64/libxcb.so.1.1.0
RUN ln -sf libzbar.so.0.2.0 /usr/lib64/libzbar.so.0 && \
    ln -sf libv4l2.so.0.0.0 /usr/lib64/libv4l2.so.0 && \
    ln -sf libv4lconvert.so.0.0.0 /usr/lib64/libv4lconvert.so.0 && \
    ln -sf libjpeg.so.62.3.0 /usr/lib64/libjpeg.so.62 && \
    ln -sf libSM.so.6.0.1 /usr/lib64/libSM.so.6 && \
    ln -sf libICE.so.6.3.0 /usr/lib64/libICE.so.6 && \
    ln -sf libX11.so.6.3.0 /usr/lib64/libX11.so.6 && \
    ln -sf libXau.so.6.0.0 /usr/lib64/libXau.so.6 && \
    ln -sf libXext.so.6.4.0 /usr/lib64/libXext.so.6 && \
    ln -sf libXv.so.1.0.0 /usr/lib64/libXv.so.1 && \
    ln -sf libxcb.so.1.1.0 /usr/lib64/libxcb.so.1 && \
    /sbin/ldconfig

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/

# Upgrade pip to ensure it can find pre-built wheels
RUN pip install --upgrade pip

# Install Python packages — force fresh install (no Docker layer cache for deps)
# Pre-built wheels for native extensions to avoid needing compilers
RUN pip install --no-cache-dir \
    --only-binary=numpy,tiktoken \
    -r requirements.txt && \
    pip uninstall -y opencv-python-headless 2>/dev/null; true

# Copy function code
COPY handler.py ${LAMBDA_TASK_ROOT}/
COPY types_def.py ${LAMBDA_TASK_ROOT}/
COPY steps/ ${LAMBDA_TASK_ROOT}/steps/
COPY utils/ ${LAMBDA_TASK_ROOT}/utils/

# Set environment variables for Poppler
ENV POPPLER_PATH=/usr/bin

# Set the handler
CMD [ "handler.handler" ]
