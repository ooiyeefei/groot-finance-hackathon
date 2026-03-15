FROM public.ecr.aws/lambda/python:3.11-arm64

COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r requirements.txt

COPY . ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
