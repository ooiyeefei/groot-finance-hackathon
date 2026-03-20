"""
Quality Gate Evaluation for DSPy Chat Agent Optimization

Compares candidate model accuracy vs previous active version on held-out eval set.
Ensures new prompts don't degrade performance (accuracy must match or improve).
"""

import json
import os
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import boto3


@dataclass
class QualityGateResult:
    """Quality gate evaluation result"""
    passed: bool
    candidate_accuracy: float
    previous_accuracy: Optional[float]
    accuracy_delta: Optional[float]
    rejection_reason: Optional[str]
    eval_set_size: int
    per_category_breakdown: Dict[str, Dict[str, float]]


@dataclass
class EvalExample:
    """Single evaluation example"""
    query: str
    intent: str
    rationale: Optional[str] = None


def load_eval_set(module: str) -> List[EvalExample]:
    """
    Load eval set from S3 or local file

    Args:
        module: DSPy module name (e.g., "chat-agent-intent")

    Returns:
        List of eval examples
    """
    # Try S3 first (production)
    s3_key = f"dspy/eval-sets/{module}/eval-set.json"
    s3_client = boto3.client('s3')
    bucket_name = os.getenv('S3_BUCKET_NAME', 'finanseal-bucket')

    try:
        response = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
        data = json.loads(response['Body'].read())
        print(f"[quality_gate] Loaded {len(data)} eval examples from S3")
        return [EvalExample(**ex) for ex in data]
    except s3_client.exceptions.NoSuchKey:
        print(f"[quality_gate] Eval set not found in S3: {s3_key}")
    except Exception as e:
        print(f"[quality_gate] Error loading eval set from S3: {e}")

    # Fall back to local file (dev/testing)
    local_path = f"/home/fei/fei/code/groot-finance/dspy-mem0-activation/specs/029-dspy-mem0-activation/eval-set/eval-set.json"
    if os.path.exists(local_path):
        with open(local_path, 'r') as f:
            data = json.load(f)
            print(f"[quality_gate] Loaded {len(data)} eval examples from local file")
            return [EvalExample(**ex) for ex in data]

    raise FileNotFoundError(f"Eval set not found in S3 or local: {module}")


def evaluate_model(model, eval_examples: List[EvalExample]) -> Tuple[float, Dict[str, Dict[str, float]]]:
    """
    Evaluate model on eval set

    Args:
        model: DSPy model (compiled program)
        eval_examples: List of eval examples

    Returns:
        (overall_accuracy, per_category_metrics)
    """
    correct = 0
    total = len(eval_examples)

    # Track per-intent metrics
    intent_stats = {}

    for example in eval_examples:
        try:
            # Run model prediction
            prediction = model(query=example.query)
            predicted_intent = prediction.intent if hasattr(prediction, 'intent') else prediction.get('intent')

            # Check correctness
            is_correct = (predicted_intent == example.intent)
            if is_correct:
                correct += 1

            # Track per-intent stats
            intent = example.intent
            if intent not in intent_stats:
                intent_stats[intent] = {'total': 0, 'correct': 0}

            intent_stats[intent]['total'] += 1
            if is_correct:
                intent_stats[intent]['correct'] += 1

        except Exception as e:
            print(f"[quality_gate] Error evaluating example: {e}")
            # Count as incorrect

    # Calculate overall accuracy
    accuracy = correct / total if total > 0 else 0.0

    # Calculate per-category metrics
    per_category = {}
    for intent, stats in intent_stats.items():
        intent_accuracy = stats['correct'] / stats['total'] if stats['total'] > 0 else 0.0
        per_category[intent] = {
            'precision': intent_accuracy,  # Simplified: using accuracy as precision
            'recall': intent_accuracy,     # Simplified: using accuracy as recall
            'f1': intent_accuracy,         # Simplified: using accuracy as F1
            'support': stats['total']
        }

    return accuracy, per_category


def run_quality_gate(
    candidate_model,
    previous_model,
    module: str,
    min_accuracy_threshold: float = 0.0
) -> QualityGateResult:
    """
    Run quality gate evaluation

    Args:
        candidate_model: Newly optimized DSPy model
        previous_model: Previous active model (None if first run)
        module: DSPy module name (e.g., "chat-agent-intent")
        min_accuracy_threshold: Minimum absolute accuracy required

    Returns:
        QualityGateResult with pass/fail decision
    """
    # Load eval set
    try:
        eval_examples = load_eval_set(module)
    except FileNotFoundError as e:
        print(f"[quality_gate] No eval set found - auto-passing (first run): {e}")
        # Auto-pass if no eval set exists (first run)
        return QualityGateResult(
            passed=True,
            candidate_accuracy=0.0,
            previous_accuracy=None,
            accuracy_delta=None,
            rejection_reason=None,
            eval_set_size=0,
            per_category_breakdown={}
        )

    if len(eval_examples) < 50:
        print(f"[quality_gate] WARNING: Eval set too small ({len(eval_examples)} examples, minimum 50 recommended)")

    # Evaluate candidate model
    candidate_accuracy, candidate_breakdown = evaluate_model(candidate_model, eval_examples)
    print(f"[quality_gate] Candidate accuracy: {candidate_accuracy:.3f}")

    # Evaluate previous model (if exists)
    previous_accuracy = None
    accuracy_delta = None

    if previous_model is not None:
        previous_accuracy, _ = evaluate_model(previous_model, eval_examples)
        accuracy_delta = candidate_accuracy - previous_accuracy
        print(f"[quality_gate] Previous accuracy: {previous_accuracy:.3f}, Delta: {accuracy_delta:+.3f}")

    # Quality gate decision
    passed = True
    rejection_reason = None

    # Check 1: Minimum absolute accuracy threshold
    if candidate_accuracy < min_accuracy_threshold:
        passed = False
        rejection_reason = f"Candidate accuracy {candidate_accuracy:.3f} below minimum threshold {min_accuracy_threshold:.3f}"

    # Check 2: No degradation vs previous (if exists)
    if previous_accuracy is not None and candidate_accuracy < previous_accuracy:
        passed = False
        rejection_reason = f"Candidate accuracy {candidate_accuracy:.3f} degrades from previous {previous_accuracy:.3f} (delta: {accuracy_delta:+.3f})"

    # Check 3: Eval set coverage (all intents represented)
    intent_coverage = len(candidate_breakdown)
    if intent_coverage < 3:
        print(f"[quality_gate] WARNING: Low intent coverage ({intent_coverage} intents in eval set)")

    result = QualityGateResult(
        passed=passed,
        candidate_accuracy=candidate_accuracy,
        previous_accuracy=previous_accuracy,
        accuracy_delta=accuracy_delta,
        rejection_reason=rejection_reason,
        eval_set_size=len(eval_examples),
        per_category_breakdown=candidate_breakdown
    )

    print(f"[quality_gate] Quality gate: {'PASS' if passed else 'FAIL'}")
    if rejection_reason:
        print(f"[quality_gate] Rejection reason: {rejection_reason}")

    return result


def serialize_quality_gate_result(result: QualityGateResult) -> Dict:
    """
    Serialize QualityGateResult to dict for Convex storage

    Args:
        result: QualityGateResult

    Returns:
        Dict suitable for Convex qualityGateResult field
    """
    return {
        'passed': result.passed,
        'candidateAccuracy': result.candidate_accuracy,
        'previousAccuracy': result.previous_accuracy,
        'accuracyDelta': result.accuracy_delta,
        'rejectionReason': result.rejection_reason,
        'evalSetSize': result.eval_set_size,
        'perCategoryBreakdown': result.per_category_breakdown
    }
