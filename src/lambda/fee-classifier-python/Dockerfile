FROM public.ecr.aws/lambda/python:3.11

# Install build tools needed by sentry-sdk native extension
RUN yum install -y gcc gcc-c++ && yum clean all

COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r requirements.txt

COPY . ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
