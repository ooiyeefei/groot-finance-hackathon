# Lambda Layer build for PDF processing dependencies
# Build with: docker build --platform linux/arm64 -t finanseal-pdf-layer .
# Extract with: docker run --rm -v $(pwd)/dist:/dist finanseal-pdf-layer

# Use Amazon Linux 2023 for building (matches Lambda runtime)
FROM --platform=linux/arm64 amazonlinux:2023

# Install Python and build tools
RUN dnf install -y python3.11 python3.11-pip poppler-utils zip && \
    dnf clean all

# Create layer directory structure
RUN mkdir -p /opt/python /dist

# Install Python packages into layer directory
COPY requirements.txt /tmp/
RUN pip3.11 install --no-cache-dir -r /tmp/requirements.txt -t /opt/python/

# Copy Python conversion script
COPY python/ /opt/python/

# Copy poppler binaries to layer (required for pdf2image)
RUN mkdir -p /opt/bin && \
    cp /usr/bin/pdftoppm /opt/bin/ && \
    cp /usr/bin/pdfinfo /opt/bin/

# Copy required shared libraries for poppler
RUN mkdir -p /opt/lib && \
    ldd /usr/bin/pdftoppm | grep "=> /" | awk '{print $3}' | xargs -I '{}' cp -v '{}' /opt/lib/ || true

# Package the layer
WORKDIR /opt
CMD ["sh", "-c", "zip -r9 /dist/python-pdf-layer.zip python bin lib && ls -lh /dist/ && echo 'Layer packaged to /dist/python-pdf-layer.zip'"]
