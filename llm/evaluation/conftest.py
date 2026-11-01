import json
import pytest
from deepeval.models import OllamaModel
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
    HallucinationMetric,
)
from evaluation.config import evaluation_settings

@pytest.fixture(scope="session")
def eval_config():
    """
    Shared evaluation configuration.
    """
    return evaluation_settings


@pytest.fixture(scope="session")
def judge_model(eval_config):
    """
    Shared Ollama model used as the LLM judge.
    """

    if not eval_config.ENABLED:
        pytest.skip("DeepEval execution is disabled")

    return OllamaModel(
        model=eval_config.effective_judge_model,
        base_url=eval_config.ollama_base_url,
        temperature=eval_config.JUDGE_TEMPERATURE,
    )


@pytest.fixture
def rag_metrics(eval_config, judge_model):
    """
    Creates fresh metric instances for each test.
    """

    if not eval_config.ENABLED:
        pytest.skip("DeepEval execution is disabled")

    return [
        AnswerRelevancyMetric(
            threshold=eval_config.ANSWER_RELEVANCY_THRESHOLD,
            model=judge_model,
            async_mode=eval_config.ASYNC_MODE,
            verbose_mode=eval_config.VERBOSE,
        ),

        FaithfulnessMetric(
            threshold=eval_config.FAITHFULNESS_THRESHOLD,
            model=judge_model,
            async_mode=eval_config.ASYNC_MODE,
            verbose_mode=eval_config.VERBOSE,
        ),

        ContextualPrecisionMetric(
            threshold=eval_config.CONTEXTUAL_PRECISION_THRESHOLD,
            model=judge_model,
            async_mode=eval_config.ASYNC_MODE,
            verbose_mode=eval_config.VERBOSE,
        ),

        ContextualRecallMetric(
            threshold=eval_config.CONTEXTUAL_RECALL_THRESHOLD,
            model=judge_model,
            async_mode=eval_config.ASYNC_MODE,
            verbose_mode=eval_config.VERBOSE,
        ),

        HallucinationMetric(
            threshold=eval_config.HALLUCINATION_THRESHOLD,
            model=judge_model,
            async_mode=eval_config.ASYNC_MODE,
            verbose_mode=eval_config.VERBOSE,
        ),
    ]


@pytest.fixture(scope="session")
def golden_dataset(eval_config):
    """
    Loads and validates the golden dataset.
    """

    dataset_path = eval_config.DATASET_PATH

    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Golden dataset not found: {dataset_path}"
        )

    with dataset_path.open("r", encoding="utf-8") as file:
        dataset = json.load(file)

    if not isinstance(dataset, list):
        raise ValueError(
            "Golden dataset must contain a JSON array."
        )

    if len(dataset) > eval_config.MAX_TEST_CASES:
        raise ValueError(
            f"Dataset exceeds maximum allowed test cases: "
            f"{eval_config.MAX_TEST_CASES}"
        )

    required_fields = ["input"]

    if eval_config.REQUIRE_EXPECTED_OUTPUT:
        required_fields.append("expected_output")

    if eval_config.REQUIRE_CONTEXT:
        required_fields.append("context")

    for index, item in enumerate(dataset):

        if not isinstance(item, dict):
            raise ValueError(
                f"Invalid dataset item at index {index}"
            )

        for field in required_fields:
            if not item.get(field):
                raise ValueError(
                    f"Missing '{field}' in dataset item {index}"
                )

    return dataset


@pytest.fixture(scope="session")
def evaluation_reports_dir(eval_config):
    """
    Creates the report directory.
    """

    eval_config.REPORTS_PATH.mkdir(
        parents=True,
        exist_ok=True,
    )

    return eval_config.REPORTS_PATH
