FROM public.ecr.aws/lambda/python:3.11

# Upgrade pip to get latest wheel resolution
RUN pip install --upgrade pip

COPY requirements.txt ${LAMBDA_TASK_ROOT}/

# Install Python deps — prefer binary wheels to avoid compilation issues
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

COPY . ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
