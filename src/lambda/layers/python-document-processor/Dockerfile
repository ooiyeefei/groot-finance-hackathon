# Lambda Layer for Document Processor - Python 3.11
#
# This layer provides all dependencies for the document processing Lambda:
# - Python 3.11 runtime (supported by AWS Durable Execution)
# - Poppler for PDF conversion (pdf2image)
# - DSPy for structured extraction
# - AWS Durable Execution SDK
# - All other Python dependencies
#
# Build with:
#   docker build --platform linux/arm64 -t finanseal-doc-processor-layer .
#
# Extract with:
#   docker run --rm -v $(pwd)/dist:/dist finanseal-doc-processor-layer

# Use official Lambda Python 3.11 image for x86_64 (better wheel support than ARM64)
FROM public.ecr.aws/lambda/python:3.11-x86_64

# Install Poppler for PDF conversion and zip for packaging (as root)
# Note: gcc not needed since we pin numpy<2.4 which has pre-built wheels
USER root
RUN yum install -y \
    poppler-utils \
    zip \
    && yum clean all

# Create layer directory structure
RUN mkdir -p /opt/python /opt/bin /opt/lib /dist

# Copy requirements
COPY requirements.txt /tmp/requirements.txt

# Upgrade pip to ensure it can find latest wheels
RUN pip install --upgrade pip

# Install Python packages into layer directory
# Use --only-binary for packages with native extensions to avoid compilation
RUN pip install --no-cache-dir \
    --only-binary=numpy,tiktoken \
    -r /tmp/requirements.txt \
    -t /opt/python/

# Copy Poppler binaries to layer
RUN cp /usr/bin/pdftoppm /opt/bin/ && \
    cp /usr/bin/pdfinfo /opt/bin/ && \
    chmod +x /opt/bin/*

# Copy required shared libraries for Poppler
RUN for binary in /opt/bin/*; do \
        ldd "$binary" 2>/dev/null | grep "=> /" | awk '{print $3}' | \
        while read lib; do \
            [ -f "$lib" ] && cp -n "$lib" /opt/lib/ 2>/dev/null || true; \
        done; \
    done

# Also copy Poppler-specific libraries
RUN cp /usr/lib64/libpoppler*.so* /opt/lib/ 2>/dev/null || true && \
    cp /usr/lib64/libjpeg*.so* /opt/lib/ 2>/dev/null || true && \
    cp /usr/lib64/libpng*.so* /opt/lib/ 2>/dev/null || true && \
    cp /usr/lib64/libz.so* /opt/lib/ 2>/dev/null || true && \
    cp /usr/lib64/libtiff*.so* /opt/lib/ 2>/dev/null || true && \
    cp /usr/lib64/libfreetype*.so* /opt/lib/ 2>/dev/null || true && \
    cp /usr/lib64/libfontconfig*.so* /opt/lib/ 2>/dev/null || true

# Package the layer
WORKDIR /opt
CMD ["sh", "-c", "\
    zip -r9 /dist/python-doc-processor-layer.zip python bin lib && \
    ls -lh /dist/ && \
    echo 'Layer packaged to /dist/python-doc-processor-layer.zip' \
"]
