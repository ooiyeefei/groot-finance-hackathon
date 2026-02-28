# E-Invoice Form Fill — browser-use + Gemini Flash (Tier 2B)
# Fully async Lambda — no nest_asyncio needed.

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

# Playwright browser path
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

# Python deps
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --upgrade pip && pip install -r requirements.txt --no-cache-dir

# Install Chromium
RUN playwright install chromium

# browser-use config dirs (Lambda /home is read-only)
ENV HOME=/tmp
ENV BROWSER_USE_CONFIG_DIR=/tmp/.browseruse

# Copy handler
COPY handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.handler"]
