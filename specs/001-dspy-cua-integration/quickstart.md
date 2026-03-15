# Quickstart: Testing DSPy CUA Integration

## Local Testing

### 1. Test Troubleshooter Module Loading
```bash
cd src/lambda/einvoice-form-fill-python
python -c "
from dspy_modules.troubleshooter import create_troubleshooter
ts = create_troubleshooter()  # Baseline (no S3 state)
print(f'Troubleshooter created: {type(ts).__name__}')
print(f'Has diagnose predictor: {hasattr(ts, \"diagnose\")}')
"
```

### 2. Test Instruction Guard
```bash
python -c "
import dspy
lm = dspy.LM('gemini/gemini-3.1-flash-lite-preview', api_key='YOUR_KEY')
dspy.settings.configure(lm=lm, adapter=dspy.JSONAdapter())

from dspy_modules.instruction_guard import generate_guarded_instructions
result = generate_guarded_instructions(
    form_description='Company Name text input, Email text input, TIN text input',
    buyer_details='{\"companyName\": \"Test Co\", \"tin\": \"C12345\", \"email\": \"test@test.com\"}',
)
print(f'Instructions: {result[\"instructions\"][:200]}')
print(f'Fallback: {result[\"fallback\"]}')
"
```

### 3. Test Optimization Pipeline (dry run)
```bash
python -c "
from optimization_handler import handler
result = handler({'source': 'manual-test'})
print(result)
# Expected: all 'not_run' or 'no_training_data' (no data accumulated yet)
"
```

## Lambda Deployment Testing
```bash
cd infra
npx cdk deploy DocumentProcessingStack --profile groot-finanseal --region us-west-2
```

## Verify Integration
After deployment, trigger a form fill via the normal expense claim flow. Check CloudWatch logs for:
- `[DSPy] Troubleshooter loaded optimized state` or `using baseline`
- `[DSPy] Instruction guard` messages
- `[DSPy] Recon module` messages
- `dspyModuleVersion` in einvoice_request_logs
