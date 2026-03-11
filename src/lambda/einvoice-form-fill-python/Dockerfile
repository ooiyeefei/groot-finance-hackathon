# E-Invoice Form Fill Lambda (Python + Playwright + Chromium)
# Build: 2026-03-11-v7-tin-match-buyer-profile

FROM public.ecr.aws/lambda/python:3.12

USER root

# Chromium system deps for AL2023
RUN dnf install -y \
    alsa-lib atk at-spi2-atk cups-libs libXcomposite libXdamage libXrandr \
    mesa-libgbm pango nss nss-util nspr libdrm libxkbcommon \
    gtk3 libXtst libXScrnSaver \
    libX11 libXext libXfixes libXi libXrender \
    dbus-libs expat fontconfig freetype harfbuzz \
    libpng libjpeg-turbo libwebp \
    && dnf clean all

# Playwright browser path (shared between root install and Lambda runtime user)
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

# Python deps
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --upgrade pip && pip install -r requirements.txt --no-cache-dir

# Install Chromium to shared path
RUN playwright install chromium

# Copy handler
COPY handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.handler"]
