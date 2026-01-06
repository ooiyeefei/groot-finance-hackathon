# Lambda Layer build for PDF processing dependencies
# Build with: docker build --platform linux/arm64 -t finanseal-pdf-layer .
# Extract with: docker run --rm -v $(pwd)/dist:/dist finanseal-pdf-layer

# Use Amazon Linux 2023 for building (matches Lambda runtime)
FROM --platform=linux/arm64 amazonlinux:2023

# Install Python and build tools
RUN dnf install -y python3.11 python3.11-pip poppler-utils zip && \
    dnf clean all

# Create layer directory structure
RUN mkdir -p /opt/python /opt/bin /opt/lib /dist

# Install Python packages into layer directory
COPY requirements.txt /tmp/
RUN pip3.11 install --no-cache-dir -r /tmp/requirements.txt -t /opt/python/

# Copy Python conversion script
COPY python/ /opt/python/

# Copy Python interpreter to layer (Node.js Lambda doesn't have Python)
RUN cp /usr/bin/python3.11 /opt/bin/python3 && \
    chmod +x /opt/bin/python3

# Copy Python standard library (required for Python to start - encodings, io, etc.)
# This is essential - without it Python fails with "No module named 'encodings'"
RUN mkdir -p /opt/lib64/python3.11 && \
    cp -r /usr/lib64/python3.11/* /opt/lib64/python3.11/

# Copy poppler binaries to layer (required for pdf2image)
RUN cp /usr/bin/pdftoppm /opt/bin/ && \
    cp /usr/bin/pdfinfo /opt/bin/ && \
    cp /usr/bin/pdftocairo /opt/bin/ 2>/dev/null || true

# Copy required shared libraries for Python and poppler
RUN for binary in /opt/bin/*; do \
        ldd "$binary" 2>/dev/null | grep "=> /" | awk '{print $3}' | \
        while read lib; do \
            [ -f "$lib" ] && cp -n "$lib" /opt/lib/ 2>/dev/null || true; \
        done; \
    done

# Also copy libpython shared library
RUN cp /usr/lib64/libpython3.11.so* /opt/lib/ 2>/dev/null || true

# Package the layer
WORKDIR /opt
CMD ["sh", "-c", "zip -r9 /dist/python-pdf-layer.zip python bin lib lib64 && ls -lh /dist/ && echo 'Layer packaged to /dist/python-pdf-layer.zip'"]
